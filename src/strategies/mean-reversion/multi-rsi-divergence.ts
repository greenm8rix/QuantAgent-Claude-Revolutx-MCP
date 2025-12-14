// Multi-RSI Divergence Strategy
// Uses multiple RSI periods to detect divergence more reliably
// Price-RSI divergence is a powerful reversal signal when confirmed across timeframes
// Reference: quantifiedstrategies.com RSI divergence studies

import { BaseStrategy, type Signal, type StrategyMetadata, type RiskProfile } from "../_base/strategy-interface.js";
import type { Candle } from "../../indicators/index.js";
import * as indicators from "../../indicators/index.js";

class MultiRSIDivergenceStrategy extends BaseStrategy {
  id = "mean-reversion/multi-rsi-divergence-v1";
  name = "Multi-RSI Divergence";
  description = "Detects bullish/bearish divergences using multiple RSI periods for confirmation";
  category = "mean_reversion" as const;

  // Multiple RSI periods for confirmation
  private rsiPeriods = [7, 14, 21]; // Short, medium, long

  // Divergence detection parameters
  private lookback = 10; // Bars to look back for swing points
  private divergenceThreshold = 0.02; // 2% minimum price divergence

  // Trend filter
  private emaPeriod = 50;

  getMetadata(): StrategyMetadata {
    return {
      minDataPoints: 70,
      preferredIntervals: [60, 240], // 1h and 4h for divergence trading
      suitableMarketConditions: ["ranging", "volatile"],
      complexity: "moderate",
      author: "claude-iteration-1",
      version: "1.0.0",
      createdAt: new Date().toISOString(),
    };
  }

  getRiskProfile(): RiskProfile {
    return {
      atrMultiplierSL: 1.5,
      atrMultiplierTP: 2.5,
      minSLPercent: 1.5,
      maxSLPercent: 4.0,
      minTPPercent: 2.0,
      maxTPPercent: 8.0,
    };
  }

  private findSwingHigh(data: number[], endIdx: number, lookback: number): { idx: number; value: number } | null {
    let maxIdx = endIdx;
    let maxVal = data[endIdx];

    for (let i = endIdx - lookback; i < endIdx; i++) {
      if (i >= 0 && data[i] > maxVal) {
        maxVal = data[i];
        maxIdx = i;
      }
    }

    // Verify it's a swing high (higher than neighbors)
    if (maxIdx > 0 && maxIdx < data.length - 1) {
      if (data[maxIdx] > data[maxIdx - 1] && data[maxIdx] > data[maxIdx + 1]) {
        return { idx: maxIdx, value: maxVal };
      }
    }

    return null;
  }

  private findSwingLow(data: number[], endIdx: number, lookback: number): { idx: number; value: number } | null {
    let minIdx = endIdx;
    let minVal = data[endIdx];

    for (let i = endIdx - lookback; i < endIdx; i++) {
      if (i >= 0 && data[i] < minVal) {
        minVal = data[i];
        minIdx = i;
      }
    }

    // Verify it's a swing low (lower than neighbors)
    if (minIdx > 0 && minIdx < data.length - 1) {
      if (data[minIdx] < data[minIdx - 1] && data[minIdx] < data[minIdx + 1]) {
        return { idx: minIdx, value: minVal };
      }
    }

    return null;
  }

  private detectDivergence(
    prices: number[],
    rsi: number[],
    endIdx: number
  ): { bullish: boolean; bearish: boolean } {
    // Find recent swing points
    const priceSwingLow = this.findSwingLow(prices, endIdx - 1, this.lookback);
    const priceSwingHigh = this.findSwingHigh(prices, endIdx - 1, this.lookback);

    let bullish = false;
    let bearish = false;

    // Bullish divergence: Price makes lower low, RSI makes higher low
    if (priceSwingLow && priceSwingLow.idx < endIdx - 2) {
      const prevPriceSwingLow = this.findSwingLow(prices, priceSwingLow.idx - 2, this.lookback);
      if (prevPriceSwingLow) {
        // Price made lower low
        const priceLowerLow = prices[endIdx] <= priceSwingLow.value * (1 + this.divergenceThreshold);

        // RSI made higher low
        const rsiAtCurrentLow = rsi[endIdx];
        const rsiAtPrevLow = rsi[priceSwingLow.idx];

        if (priceLowerLow && rsiAtCurrentLow > rsiAtPrevLow && rsiAtCurrentLow < 40) {
          bullish = true;
        }
      }
    }

    // Bearish divergence: Price makes higher high, RSI makes lower high
    if (priceSwingHigh && priceSwingHigh.idx < endIdx - 2) {
      const prevPriceSwingHigh = this.findSwingHigh(prices, priceSwingHigh.idx - 2, this.lookback);
      if (prevPriceSwingHigh) {
        // Price made higher high
        const priceHigherHigh = prices[endIdx] >= priceSwingHigh.value * (1 - this.divergenceThreshold);

        // RSI made lower high
        const rsiAtCurrentHigh = rsi[endIdx];
        const rsiAtPrevHigh = rsi[priceSwingHigh.idx];

        if (priceHigherHigh && rsiAtCurrentHigh < rsiAtPrevHigh && rsiAtCurrentHigh > 60) {
          bearish = true;
        }
      }
    }

    return { bullish, bearish };
  }

  async analyze(candles: Candle[]): Promise<Signal> {
    if (candles.length < this.emaPeriod + this.lookback + 10) {
      return "hold";
    }

    const closes = candles.map(c => c.close);
    const highs = candles.map(c => c.high);
    const lows = candles.map(c => c.low);
    const i = candles.length - 1;

    // Calculate multiple RSIs
    const rsiShort = indicators.RSI_Simple(closes, this.rsiPeriods[0]);
    const rsiMedium = indicators.RSI_Simple(closes, this.rsiPeriods[1]);
    const rsiLong = indicators.RSI_Simple(closes, this.rsiPeriods[2]);

    // EMA for trend context
    const ema = indicators.EMA(closes, this.emaPeriod);

    // Skip if not ready
    if (isNaN(rsiLong[i]) || isNaN(ema[i])) {
      return "hold";
    }

    // Detect divergence on each RSI
    const divShort = this.detectDivergence(closes, rsiShort, i);
    const divMedium = this.detectDivergence(closes, rsiMedium, i);
    const divLong = this.detectDivergence(closes, rsiLong, i);

    // Count confirmations
    let bullishCount = 0;
    let bearishCount = 0;

    if (divShort.bullish) bullishCount++;
    if (divMedium.bullish) bullishCount++;
    if (divLong.bullish) bullishCount++;

    if (divShort.bearish) bearishCount++;
    if (divMedium.bearish) bearishCount++;
    if (divLong.bearish) bearishCount++;

    // Current RSI states for additional confirmation
    const currentRsiShort = rsiShort[i];
    const currentRsiMedium = rsiMedium[i];
    const prevRsiShort = rsiShort[i - 1];

    // Price relative to EMA (trend context)
    const priceAboveEMA = closes[i] > ema[i];
    const priceBelowEMA = closes[i] < ema[i];

    // RSI turning point
    const rsiTurningUp = currentRsiShort > prevRsiShort && currentRsiShort < 40;
    const rsiTurningDown = currentRsiShort < prevRsiShort && currentRsiShort > 60;

    // === TRIPLE DIVERGENCE (STRONGEST SIGNAL) ===
    if (bullishCount >= 3) {
      return "buy";
    }

    if (bearishCount >= 3) {
      return "sell";
    }

    // === DOUBLE DIVERGENCE + RSI TURN ===
    if (bullishCount >= 2 && rsiTurningUp) {
      return "buy";
    }

    if (bearishCount >= 2 && rsiTurningDown) {
      return "sell";
    }

    // === SINGLE DIVERGENCE (MEDIUM RSI) + OVERSOLD/OVERBOUGHT ===
    // The medium period RSI is most reliable
    if (divMedium.bullish && currentRsiMedium < 30 && rsiTurningUp) {
      return "buy";
    }

    if (divMedium.bearish && currentRsiMedium > 70 && rsiTurningDown) {
      return "sell";
    }

    // === DIVERGENCE + TREND ALIGNMENT ===
    // Bullish divergence while price is above EMA (pullback in uptrend)
    if (bullishCount >= 1 && priceAboveEMA && currentRsiMedium < 40) {
      return "buy";
    }

    // Bearish divergence while price is below EMA (rally in downtrend)
    if (bearishCount >= 1 && priceBelowEMA && currentRsiMedium > 60) {
      return "sell";
    }

    return "hold";
  }
}

export default new MultiRSIDivergenceStrategy();
