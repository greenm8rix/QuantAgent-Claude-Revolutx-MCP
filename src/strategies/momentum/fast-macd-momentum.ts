// Fast MACD Momentum Strategy V10
// Uses Linda Raschke's fast MACD settings (3-10-16) optimized for crypto
// Based on 2025 research: fast settings capture crypto's volatility better
// Combined with RSI and volume filters for confirmation

import { BaseStrategy, type Signal, type StrategyMetadata, type RiskProfile } from "../_base/strategy-interface.js";
import type { Candle } from "../../indicators/index.js";
import * as indicators from "../../indicators/index.js";

class FastMACDMomentumStrategy extends BaseStrategy {
  id = "momentum/fast-macd-momentum-v10";
  name = "Fast MACD Momentum";
  description = "Linda Raschke fast MACD (3-10-16) optimized for crypto volatility with RSI and volume confirmation";
  category = "momentum" as const;

  // Fast MACD parameters (Linda Raschke settings)
  private macdFast = 3;
  private macdSlow = 10;
  private macdSignal = 16;

  // RSI filter
  private rsiPeriod = 7;
  private rsiOversold = 30;
  private rsiOverbought = 70;

  // Volume confirmation
  private volumePeriod = 20;
  private volumeMultiplier = 1.15;

  // Trend filter
  private emaPeriod = 21;

  getMetadata(): StrategyMetadata {
    return {
      minDataPoints: 40,
      preferredIntervals: [15, 60], // 15m and 1h recommended
      suitableMarketConditions: ["trending", "volatile"],
      complexity: "simple",
      author: "claude-iteration-v10",
      version: "10.0.0",
      createdAt: new Date().toISOString(),
    };
  }

  getRiskProfile(): RiskProfile {
    return {
      atrMultiplierSL: 1.2,
      atrMultiplierTP: 2.5,
      minSLPercent: 0.8,
      maxSLPercent: 3.0,
      minTPPercent: 1.5,
      maxTPPercent: 6.0,
    };
  }

  async analyze(candles: Candle[]): Promise<Signal> {
    if (candles.length < this.macdSignal + this.macdSlow + 5) {
      return "hold";
    }

    const i = candles.length - 1;
    const closes = candles.map(c => c.close);
    const volumes = candles.map(c => c.volume);

    // Calculate fast MACD
    const macd = indicators.MACD(closes, this.macdFast, this.macdSlow, this.macdSignal);
    const currentMACD = macd.macd[i];
    const currentSignal = macd.signal[i];
    const prevMACD = macd.macd[i - 1];
    const prevSignal = macd.signal[i - 1];
    const currentHistogram = macd.histogram[i];
    const prevHistogram = macd.histogram[i - 1];

    // Skip if not ready
    if (isNaN(currentMACD) || isNaN(currentSignal)) {
      return "hold";
    }

    // RSI filter
    const rsi = indicators.RSI_Simple(closes, this.rsiPeriod);
    const currentRSI = rsi[i];

    // Volume confirmation
    const volumeSMA = indicators.SMA(volumes, this.volumePeriod);
    const isHighVolume = volumes[i] > volumeSMA[i] * this.volumeMultiplier;

    // EMA trend filter
    const ema = indicators.EMA(closes, this.emaPeriod);
    const aboveEma = closes[i] > ema[i];

    // MACD crossover detection
    const bullishCross = prevMACD <= prevSignal && currentMACD > currentSignal;
    const bearishCross = prevMACD >= prevSignal && currentMACD < currentSignal;

    // Histogram momentum (accelerating)
    const histogramAccelerating = Math.abs(currentHistogram) > Math.abs(prevHistogram);

    // Zero line cross
    const crossedAboveZero = prevMACD <= 0 && currentMACD > 0;
    const crossedBelowZero = prevMACD >= 0 && currentMACD < 0;

    // Buy conditions:
    // 1. MACD bullish crossover + RSI not overbought + above EMA
    // 2. OR MACD crosses above zero with accelerating histogram
    if ((bullishCross && currentRSI < this.rsiOverbought && aboveEma) ||
        (crossedAboveZero && histogramAccelerating && currentRSI < 60)) {
      return "buy";
    }

    // Sell conditions:
    // 1. MACD bearish crossover + RSI not oversold + below EMA
    // 2. OR MACD crosses below zero with accelerating histogram
    if ((bearishCross && currentRSI > this.rsiOversold && !aboveEma) ||
        (crossedBelowZero && histogramAccelerating && currentRSI > 40)) {
      return "sell";
    }

    return "hold";
  }
}

export default new FastMACDMomentumStrategy();
