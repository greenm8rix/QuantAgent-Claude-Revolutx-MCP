// Adaptive Multi-Indicator Strategy V10
// Dynamically adjusts indicator parameters based on recent volatility
// Based on 2025 research: AI-optimized indicators show 15-30% better win rates
// Uses ATR-based parameter scaling

import { BaseStrategy, type Signal, type StrategyMetadata, type RiskProfile } from "../_base/strategy-interface.js";
import type { Candle } from "../../indicators/index.js";
import * as indicators from "../../indicators/index.js";

class AdaptiveMultiIndicatorStrategy extends BaseStrategy {
  id = "composite/adaptive-multi-indicator-v10";
  name = "Adaptive Multi-Indicator";
  description = "Dynamically adjusts RSI/MACD/BB parameters based on market volatility for optimal signals";
  category = "composite" as const;

  // Base parameters (will be scaled)
  private baseRsiPeriod = 14;
  private baseMacdFast = 12;
  private baseMacdSlow = 26;
  private baseMacdSignal = 9;
  private baseBbPeriod = 20;

  // Volatility detection
  private atrPeriod = 14;
  private volatilityLookback = 30;

  // Adaptive multipliers
  private lowVolMultiplier = 1.3;  // Slower indicators in low vol
  private highVolMultiplier = 0.7; // Faster indicators in high vol

  getMetadata(): StrategyMetadata {
    return {
      minDataPoints: 70,
      preferredIntervals: [60, 240],
      suitableMarketConditions: ["trending", "volatile", "ranging"],
      complexity: "complex",
      author: "claude-iteration-v10",
      version: "10.0.0",
      createdAt: new Date().toISOString(),
    };
  }

  getRiskProfile(): RiskProfile {
    return {
      atrMultiplierSL: 1.5,
      atrMultiplierTP: 3.0,
      minSLPercent: 1.2,
      maxSLPercent: 4.5,
      minTPPercent: 2.5,
      maxTPPercent: 10.0,
    };
  }

  private getVolatilityMultiplier(candles: Candle[]): number {
    const i = candles.length - 1;
    const atr = indicators.ATR(candles, this.atrPeriod);
    const currentATR = atr[i];

    // Calculate historical ATR average
    const atrSlice = atr.slice(Math.max(0, i - this.volatilityLookback), i);
    const avgATR = atrSlice.reduce((a, b) => a + b, 0) / atrSlice.length;

    // Volatility ratio
    const volRatio = currentATR / avgATR;

    // Scale multiplier based on volatility
    // High vol (>1.3x avg) = use faster params (0.7x)
    // Low vol (<0.7x avg) = use slower params (1.3x)
    // Normal = 1.0x
    if (volRatio > 1.3) {
      return this.highVolMultiplier;
    } else if (volRatio < 0.7) {
      return this.lowVolMultiplier;
    } else {
      // Linear interpolation
      return 1.0 + (1.0 - volRatio) * 0.3;
    }
  }

  async analyze(candles: Candle[]): Promise<Signal> {
    if (candles.length < this.volatilityLookback + this.baseMacdSlow + 10) {
      return "hold";
    }

    const i = candles.length - 1;
    const closes = candles.map(c => c.close);
    const volumes = candles.map(c => c.volume);

    // Get adaptive multiplier
    const multiplier = this.getVolatilityMultiplier(candles);

    // Calculate adaptive parameters
    const adaptiveRsiPeriod = Math.round(this.baseRsiPeriod * multiplier);
    const adaptiveMacdFast = Math.round(this.baseMacdFast * multiplier);
    const adaptiveMacdSlow = Math.round(this.baseMacdSlow * multiplier);
    const adaptiveBbPeriod = Math.round(this.baseBbPeriod * multiplier);

    // Ensure minimum values
    const rsiPeriod = Math.max(5, adaptiveRsiPeriod);
    const macdFast = Math.max(5, adaptiveMacdFast);
    const macdSlow = Math.max(10, adaptiveMacdSlow);
    const bbPeriod = Math.max(10, adaptiveBbPeriod);

    // Calculate indicators with adaptive parameters
    const rsi = indicators.RSI_Simple(closes, rsiPeriod);
    const macd = indicators.MACD(closes, macdFast, macdSlow, this.baseMacdSignal);
    const bb = indicators.BollingerBands(closes, bbPeriod, 2);

    const currentRSI = rsi[i];
    const prevRSI = rsi[i - 1];
    const currentMACD = macd.macd[i];
    const currentSignal = macd.signal[i];
    const prevMACD = macd.macd[i - 1];
    const prevSignal = macd.signal[i - 1];
    const currentClose = closes[i];

    // Adaptive thresholds based on volatility
    const rsiOversold = 30 + (1 - multiplier) * 10; // Higher vol = lower threshold
    const rsiOverbought = 70 - (1 - multiplier) * 10;

    // Skip if indicators not ready
    if (isNaN(currentRSI) || isNaN(currentMACD) || isNaN(bb.lower[i])) {
      return "hold";
    }

    // Volume confirmation
    const volumeSMA = indicators.SMA(volumes, 20);
    const isHighVolume = volumes[i] > volumeSMA[i] * 1.1;

    // MACD crossover
    const macdBullishCross = prevMACD <= prevSignal && currentMACD > currentSignal;
    const macdBearishCross = prevMACD >= prevSignal && currentMACD < currentSignal;

    // RSI conditions
    const rsiTurningUp = currentRSI > prevRSI && currentRSI < rsiOversold + 15;
    const rsiTurningDown = currentRSI < prevRSI && currentRSI > rsiOverbought - 15;

    // BB position
    const nearLowerBB = currentClose < bb.middle[i] && currentClose > bb.lower[i] * 0.98;
    const nearUpperBB = currentClose > bb.middle[i] && currentClose < bb.upper[i] * 1.02;

    // Multi-indicator confluence score
    let bullScore = 0;
    let bearScore = 0;

    if (macdBullishCross) bullScore += 2;
    if (currentRSI < rsiOversold + 10 && rsiTurningUp) bullScore += 2;
    if (nearLowerBB) bullScore += 1;
    if (isHighVolume && currentClose > closes[i - 1]) bullScore += 1;

    if (macdBearishCross) bearScore += 2;
    if (currentRSI > rsiOverbought - 10 && rsiTurningDown) bearScore += 2;
    if (nearUpperBB) bearScore += 1;
    if (isHighVolume && currentClose < closes[i - 1]) bearScore += 1;

    // Require minimum confluence score
    if (bullScore >= 3) {
      return "buy";
    }

    if (bearScore >= 3) {
      return "sell";
    }

    return "hold";
  }
}

export default new AdaptiveMultiIndicatorStrategy();
