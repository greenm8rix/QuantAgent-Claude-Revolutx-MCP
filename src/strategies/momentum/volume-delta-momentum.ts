// Volume Delta Momentum Strategy V10
// Uses cumulative volume delta divergence for entry signals
// Based on 2025 research: price-volume divergence signals trend reversals
// Positive delta + rising price = continuation, divergence = reversal

import { BaseStrategy, type Signal, type StrategyMetadata, type RiskProfile } from "../_base/strategy-interface.js";
import type { Candle } from "../../indicators/index.js";
import * as indicators from "../../indicators/index.js";

class VolumeDeltaMomentumStrategy extends BaseStrategy {
  id = "momentum/volume-delta-momentum-v10";
  name = "Volume Delta Momentum";
  description = "Uses cumulative volume delta divergence with price for high-probability entries";
  category = "momentum" as const;

  // Delta calculation parameters
  private deltaLookback = 14;

  // RSI filter
  private rsiPeriod = 14;
  private rsiBuyThreshold = 45;
  private rsiSellThreshold = 55;

  // Volume confirmation
  private volumePeriod = 20;
  private volumeMultiplier = 1.2;

  // Trend filter
  private emaPeriod = 21;

  getMetadata(): StrategyMetadata {
    return {
      minDataPoints: 50,
      preferredIntervals: [15, 60], // 15m and 1h best for volume analysis
      suitableMarketConditions: ["trending", "volatile"],
      complexity: "moderate",
      author: "claude-iteration-v10",
      version: "10.0.0",
      createdAt: new Date().toISOString(),
    };
  }

  getRiskProfile(): RiskProfile {
    return {
      atrMultiplierSL: 1.5,
      atrMultiplierTP: 3.0,
      minSLPercent: 1.0,
      maxSLPercent: 4.0,
      minTPPercent: 2.0,
      maxTPPercent: 8.0,
    };
  }

  // Simulate volume delta based on candle structure (buy/sell pressure)
  private calculateVolumeDelta(candles: Candle[]): number[] {
    const delta: number[] = [];

    for (let i = 0; i < candles.length; i++) {
      const c = candles[i];
      const range = c.high - c.low;

      if (range === 0) {
        delta.push(0);
        continue;
      }

      // Estimate buy/sell pressure from candle body
      // Close near high = buying pressure, close near low = selling pressure
      const buyPressure = (c.close - c.low) / range;
      const sellPressure = (c.high - c.close) / range;

      // Delta = (buyPressure - sellPressure) * volume
      const volumeDelta = (buyPressure - sellPressure) * c.volume;
      delta.push(volumeDelta);
    }

    return delta;
  }

  // Calculate cumulative volume delta over lookback period
  private cumulativeDelta(deltas: number[], index: number, lookback: number): number {
    const start = Math.max(0, index - lookback + 1);
    let cumDelta = 0;
    for (let j = start; j <= index; j++) {
      cumDelta += deltas[j];
    }
    return cumDelta;
  }

  async analyze(candles: Candle[]): Promise<Signal> {
    if (candles.length < this.volumePeriod + 10) {
      return "hold";
    }

    const i = candles.length - 1;
    const closes = candles.map(c => c.close);
    const volumes = candles.map(c => c.volume);

    // Calculate volume delta
    const deltas = this.calculateVolumeDelta(candles);
    const currentCumDelta = this.cumulativeDelta(deltas, i, this.deltaLookback);
    const prevCumDelta = this.cumulativeDelta(deltas, i - 3, this.deltaLookback);

    // Price change over same period
    const priceChange = closes[i] - closes[i - this.deltaLookback];
    const priceChangePercent = (priceChange / closes[i - this.deltaLookback]) * 100;

    // RSI for momentum filter
    const rsi = indicators.RSI_Simple(closes, this.rsiPeriod);
    const currentRSI = rsi[i];

    // Volume confirmation
    const volumeSMA = indicators.SMA(volumes, this.volumePeriod);
    const isHighVolume = volumes[i] > volumeSMA[i] * this.volumeMultiplier;

    // EMA trend
    const ema = indicators.EMA(closes, this.emaPeriod);
    const aboveEma = closes[i] > ema[i];

    // Delta direction (current vs previous)
    const deltaRising = currentCumDelta > prevCumDelta;
    const deltaFalling = currentCumDelta < prevCumDelta;

    // Bullish: positive delta rising + price rising + RSI not overbought
    const bullishDelta = currentCumDelta > 0 && deltaRising;
    // Bearish: negative delta falling + price falling + RSI not oversold
    const bearishDelta = currentCumDelta < 0 && deltaFalling;

    // Divergence signals (contrarian)
    // Bullish divergence: price falling but delta rising (accumulation)
    const bullishDivergence = priceChangePercent < -1 && deltaRising && currentCumDelta > prevCumDelta * 0.5;
    // Bearish divergence: price rising but delta falling (distribution)
    const bearishDivergence = priceChangePercent > 1 && deltaFalling && currentCumDelta < prevCumDelta * 0.5;

    // Buy signal: bullish delta confirmation OR bullish divergence
    if ((bullishDelta && aboveEma && currentRSI < 65) ||
        (bullishDivergence && currentRSI < this.rsiBuyThreshold)) {
      return "buy";
    }

    // Sell signal: bearish delta confirmation OR bearish divergence
    if ((bearishDelta && !aboveEma && currentRSI > 35) ||
        (bearishDivergence && currentRSI > this.rsiSellThreshold)) {
      return "sell";
    }

    return "hold";
  }
}

export default new VolumeDeltaMomentumStrategy();
