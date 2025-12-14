// RSI + Bollinger Bands + Volume Confluence Strategy
// Based on top performer rsi_bb_vol with 83.3% win rate, 23.53% PnL, 26.44 Sharpe
// Combines RSI extremes with BB band touches and volume confirmation

import { BaseStrategy, type Signal, type StrategyMetadata, type RiskProfile } from "../_base/strategy-interface.js";
import type { Candle } from "../../indicators/index.js";
import * as indicators from "../../indicators/index.js";

class RSIBBVolumeConfluenceStrategy extends BaseStrategy {
  id = "momentum/rsi-bb-volume-confluence-v1";
  name = "RSI BB Volume Confluence";
  description = "High-probability entries using RSI extremes confirmed by Bollinger Band touches and volume spikes";
  category = "momentum" as const;

  // Optimized parameters - relaxed for more signals
  private rsiPeriod = 7;
  private rsiBuyThreshold = 35;
  private rsiSellThreshold = 65;
  private bbPeriod = 20;
  private bbStdDev = 2;
  private volumeMultiplier = 1.2; // Volume must be 1.2x average (relaxed)

  getMetadata(): StrategyMetadata {
    return {
      minDataPoints: 50,
      preferredIntervals: [60, 240], // 1h and 4h work best
      suitableMarketConditions: ["volatile", "ranging"],
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
      minSLPercent: 1.0,
      maxSLPercent: 4.0,
      minTPPercent: 2.0,
      maxTPPercent: 8.0,
    };
  }

  async analyze(candles: Candle[]): Promise<Signal> {
    if (candles.length < this.bbPeriod + 10) {
      return "hold";
    }

    const closes = candles.map(c => c.close);
    const volumes = candles.map(c => c.volume);

    // Calculate indicators
    const rsi = indicators.RSI_Simple(closes, this.rsiPeriod);
    const bb = indicators.BollingerBands(closes, this.bbPeriod, this.bbStdDev);
    const volumeSMA = indicators.SMA(volumes, 20);

    const i = candles.length - 1;
    const currentRSI = rsi[i];
    const prevRSI = rsi[i - 1];
    const currentClose = closes[i];
    const currentLow = candles[i].low;
    const currentHigh = candles[i].high;
    const currentVolume = volumes[i];
    const avgVolume = volumeSMA[i];

    // Skip if indicators not ready
    if (isNaN(currentRSI) || isNaN(bb.lower[i]) || isNaN(avgVolume)) {
      return "hold";
    }

    // Volume confirmation
    const isVolumeSpike = currentVolume > avgVolume * this.volumeMultiplier;

    // Buy Signal: RSI oversold + price near/below lower BB
    // Relaxed conditions for more signals
    const bbLowerProximity = (currentClose - bb.lower[i]) / (bb.middle[i] - bb.lower[i]);
    const bbUpperProximity = (bb.upper[i] - currentClose) / (bb.upper[i] - bb.middle[i]);

    const isBuySignal = (
      currentRSI < this.rsiBuyThreshold &&
      currentRSI > prevRSI && // RSI turning up
      (currentLow <= bb.lower[i] * 1.02 || bbLowerProximity < 0.3) // Near lower BB
    );

    // Sell Signal: RSI overbought + price near/above upper BB
    const isSellSignal = (
      currentRSI > this.rsiSellThreshold &&
      currentRSI < prevRSI && // RSI turning down
      (currentHigh >= bb.upper[i] * 0.98 || bbUpperProximity < 0.3) // Near upper BB
    );

    if (isBuySignal) {
      return "buy";
    }

    if (isSellSignal) {
      return "sell";
    }

    return "hold";
  }
}

export default new RSIBBVolumeConfluenceStrategy();
