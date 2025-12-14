// Absorption Reversal Strategy V10
// Detects volume absorption at key levels for reversal entries
// Based on 2025 order flow research: absorption often precedes reversals
// When strong volume fails to move price = hidden supply/demand absorption

import { BaseStrategy, type Signal, type StrategyMetadata, type RiskProfile } from "../_base/strategy-interface.js";
import type { Candle } from "../../indicators/index.js";
import * as indicators from "../../indicators/index.js";

class AbsorptionReversalStrategy extends BaseStrategy {
  id = "mean-reversion/absorption-reversal-v10";
  name = "Absorption Reversal";
  description = "Detects volume absorption at extremes - high volume with no price movement signals reversals";
  category = "mean_reversion" as const;

  // Volume parameters
  private volumePeriod = 20;
  private highVolumeMultiplier = 1.8; // Must be high volume

  // Price movement threshold (absorption = high vol, low move)
  private maxPriceChangePercent = 0.5; // Price moved less than 0.5%

  // RSI for extremes
  private rsiPeriod = 7;
  private rsiOversold = 25;
  private rsiOverbought = 75;

  // Bollinger Bands for extreme detection
  private bbPeriod = 20;
  private bbStdDev = 2;

  // Confirmation bars
  private absorptionLookback = 3;

  getMetadata(): StrategyMetadata {
    return {
      minDataPoints: 40,
      preferredIntervals: [15, 60],
      suitableMarketConditions: ["volatile", "ranging"],
      complexity: "moderate",
      author: "claude-iteration-v10",
      version: "10.0.0",
      createdAt: new Date().toISOString(),
    };
  }

  getRiskProfile(): RiskProfile {
    return {
      atrMultiplierSL: 1.5,
      atrMultiplierTP: 2.5,
      minSLPercent: 1.0,
      maxSLPercent: 3.5,
      minTPPercent: 1.5,
      maxTPPercent: 6.0,
    };
  }

  // Detect absorption: high volume but small price change
  private detectAbsorption(candle: Candle, avgVolume: number): boolean {
    // High volume requirement
    if (candle.volume < avgVolume * this.highVolumeMultiplier) {
      return false;
    }

    // Calculate price change percentage
    const priceChange = Math.abs(candle.close - candle.open) / candle.open * 100;

    // Small body despite high volume = absorption
    return priceChange < this.maxPriceChangePercent;
  }

  // Detect absorption pattern over multiple bars
  private countAbsorptionBars(candles: Candle[], avgVolume: number): number {
    let count = 0;
    for (let j = candles.length - 1; j >= Math.max(0, candles.length - this.absorptionLookback); j--) {
      if (this.detectAbsorption(candles[j], avgVolume)) {
        count++;
      }
    }
    return count;
  }

  async analyze(candles: Candle[]): Promise<Signal> {
    if (candles.length < this.volumePeriod + 10) {
      return "hold";
    }

    const i = candles.length - 1;
    const closes = candles.map(c => c.close);
    const volumes = candles.map(c => c.volume);

    // Calculate volume average
    const volumeSMA = indicators.SMA(volumes, this.volumePeriod);
    const avgVolume = volumeSMA[i];

    // Check for absorption pattern
    const absorptionCount = this.countAbsorptionBars(candles, avgVolume);

    // Need at least 1 absorption bar recently
    if (absorptionCount === 0) {
      return "hold";
    }

    // RSI for extreme detection
    const rsi = indicators.RSI_Simple(closes, this.rsiPeriod);
    const currentRSI = rsi[i];
    const prevRSI = rsi[i - 1];

    // Bollinger Bands for extreme position
    const bb = indicators.BollingerBands(closes, this.bbPeriod, this.bbStdDev);
    const currentClose = closes[i];
    const currentLow = candles[i].low;
    const currentHigh = candles[i].high;

    // Position relative to BB
    const nearLowerBB = currentLow <= bb.lower[i] * 1.01;
    const nearUpperBB = currentHigh >= bb.upper[i] * 0.99;

    // Bullish absorption reversal:
    // - Absorption at lower BB (selling absorbed)
    // - RSI oversold and turning up
    // - Price held despite selling pressure
    if (nearLowerBB && currentRSI < this.rsiOversold + 10 && currentRSI > prevRSI) {
      // Verify it's bullish absorption (closed higher than open or small body)
      const currentCandle = candles[i];
      const isBullishCandle = currentCandle.close >= currentCandle.open;
      const smallBody = Math.abs(currentCandle.close - currentCandle.open) < (currentCandle.high - currentCandle.low) * 0.3;

      if (isBullishCandle || smallBody) {
        return "buy";
      }
    }

    // Bearish absorption reversal:
    // - Absorption at upper BB (buying absorbed)
    // - RSI overbought and turning down
    // - Price held despite buying pressure
    if (nearUpperBB && currentRSI > this.rsiOverbought - 10 && currentRSI < prevRSI) {
      const currentCandle = candles[i];
      const isBearishCandle = currentCandle.close <= currentCandle.open;
      const smallBody = Math.abs(currentCandle.close - currentCandle.open) < (currentCandle.high - currentCandle.low) * 0.3;

      if (isBearishCandle || smallBody) {
        return "sell";
      }
    }

    return "hold";
  }
}

export default new AbsorptionReversalStrategy();
