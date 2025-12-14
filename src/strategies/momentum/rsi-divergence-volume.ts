// RSI Divergence with Volume Strategy
// Based on 2025 research: Divergence + key level + volume = stronger signals
// Detects bullish/bearish RSI divergences confirmed by volume expansion

import { BaseStrategy, type Signal, type StrategyMetadata, type RiskProfile } from "../_base/strategy-interface.js";
import type { Candle } from "../../indicators/index.js";
import * as indicators from "../../indicators/index.js";

class RSIDivergenceVolumeStrategy extends BaseStrategy {
  id = "momentum/rsi-divergence-volume-v1";
  name = "RSI Divergence Volume";
  description = "RSI price divergence detection with volume confirmation for reversal entries";
  category = "momentum" as const;

  // Parameters
  private rsiPeriod = 14;
  private divergenceLookback = 10;  // Candles to look back for divergence
  private volumeThreshold = 1.25;
  private rsiExtremeHigh = 65;
  private rsiExtremeLow = 35;

  getMetadata(): StrategyMetadata {
    return {
      minDataPoints: 50,
      preferredIntervals: [60, 240],
      suitableMarketConditions: ["trending", "volatile"],
      complexity: "moderate",
      author: "claude-iteration-1",
      version: "1.0.0",
      createdAt: new Date().toISOString(),
    };
  }

  getRiskProfile(): RiskProfile {
    return {
      atrMultiplierSL: 1.5,
      atrMultiplierTP: 3.0,
      minSLPercent: 1.5,
      maxSLPercent: 5.0,
      minTPPercent: 3.0,
      maxTPPercent: 10.0,
    };
  }

  private findLocalLows(arr: number[], lookback: number, endIdx: number): { idx: number, value: number }[] {
    const lows: { idx: number, value: number }[] = [];
    const startIdx = Math.max(0, endIdx - lookback);
    
    for (let i = startIdx + 1; i < endIdx; i++) {
      if (arr[i] < arr[i - 1] && arr[i] < arr[i + 1]) {
        lows.push({ idx: i, value: arr[i] });
      }
    }
    return lows;
  }

  private findLocalHighs(arr: number[], lookback: number, endIdx: number): { idx: number, value: number }[] {
    const highs: { idx: number, value: number }[] = [];
    const startIdx = Math.max(0, endIdx - lookback);
    
    for (let i = startIdx + 1; i < endIdx; i++) {
      if (arr[i] > arr[i - 1] && arr[i] > arr[i + 1]) {
        highs.push({ idx: i, value: arr[i] });
      }
    }
    return highs;
  }

  async analyze(candles: Candle[]): Promise<Signal> {
    if (candles.length < 50) return "hold";

    const closes = candles.map(c => c.close);
    const lows = candles.map(c => c.low);
    const highs = candles.map(c => c.high);
    const volumes = candles.map(c => c.volume);
    const i = candles.length - 1;

    // Calculate indicators
    const rsi = indicators.RSI_Simple(closes, this.rsiPeriod);
    const volumeSMA = indicators.SMA(volumes, 20);

    const currentRSI = rsi[i];
    const currentClose = closes[i];
    const currentVolume = volumes[i];
    const avgVolume = volumeSMA[i];

    if (isNaN(currentRSI) || isNaN(avgVolume)) {
      return "hold";
    }

    // Volume confirmation
    const hasVolumeSpike = currentVolume > avgVolume * this.volumeThreshold;

    // ============== BULLISH DIVERGENCE ==============
    // Price making lower lows but RSI making higher lows
    const priceLows = this.findLocalLows(lows, this.divergenceLookback, i);
    const rsiLows = this.findLocalLows(rsi, this.divergenceLookback, i);

    let bullishDivergence = false;
    if (priceLows.length >= 2 && rsiLows.length >= 2) {
      const recentPriceLow = priceLows[priceLows.length - 1];
      const prevPriceLow = priceLows[priceLows.length - 2];
      
      // Find corresponding RSI lows
      const recentRSILow = rsiLows.find(r => Math.abs(r.idx - recentPriceLow.idx) <= 2);
      const prevRSILow = rsiLows.find(r => Math.abs(r.idx - prevPriceLow.idx) <= 2);

      if (recentRSILow && prevRSILow) {
        // Price lower low + RSI higher low = bullish divergence
        if (recentPriceLow.value < prevPriceLow.value && 
            recentRSILow.value > prevRSILow.value &&
            currentRSI < this.rsiExtremeLow + 20) {
          bullishDivergence = true;
        }
      }
    }

    // Current candle showing reversal + RSI turning up
    const rsiTurningUp = currentRSI > rsi[i - 1] && currentRSI > rsi[i - 2];
    const priceReversingUp = closes[i] > closes[i - 1] && closes[i - 1] <= closes[i - 2];

    // ============== BEARISH DIVERGENCE ==============
    // Price making higher highs but RSI making lower highs
    const priceHighs = this.findLocalHighs(highs, this.divergenceLookback, i);
    const rsiHighs = this.findLocalHighs(rsi, this.divergenceLookback, i);

    let bearishDivergence = false;
    if (priceHighs.length >= 2 && rsiHighs.length >= 2) {
      const recentPriceHigh = priceHighs[priceHighs.length - 1];
      const prevPriceHigh = priceHighs[priceHighs.length - 2];
      
      // Find corresponding RSI highs
      const recentRSIHigh = rsiHighs.find(r => Math.abs(r.idx - recentPriceHigh.idx) <= 2);
      const prevRSIHigh = rsiHighs.find(r => Math.abs(r.idx - prevPriceHigh.idx) <= 2);

      if (recentRSIHigh && prevRSIHigh) {
        // Price higher high + RSI lower high = bearish divergence
        if (recentPriceHigh.value > prevPriceHigh.value && 
            recentRSIHigh.value < prevRSIHigh.value &&
            currentRSI > this.rsiExtremeHigh - 20) {
          bearishDivergence = true;
        }
      }
    }

    // Current candle showing reversal + RSI turning down
    const rsiTurningDown = currentRSI < rsi[i - 1] && currentRSI < rsi[i - 2];
    const priceReversingDown = closes[i] < closes[i - 1] && closes[i - 1] >= closes[i - 2];

    // ============== SIGNALS ==============
    if (bullishDivergence && rsiTurningUp && priceReversingUp && hasVolumeSpike) {
      return "buy";
    }

    // Relaxed buy: divergence + one of the other conditions
    if (bullishDivergence && (rsiTurningUp || hasVolumeSpike) && currentRSI < 40) {
      return "buy";
    }

    if (bearishDivergence && rsiTurningDown && priceReversingDown && hasVolumeSpike) {
      return "sell";
    }

    // Relaxed sell: divergence + one of the other conditions
    if (bearishDivergence && (rsiTurningDown || hasVolumeSpike) && currentRSI > 60) {
      return "sell";
    }

    return "hold";
  }
}

export default new RSIDivergenceVolumeStrategy();
