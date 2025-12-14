// ADX Trend Following Strategy
// Uses ADX (Average Directional Index) to identify strong trends and trade in their direction
// Combines ADX strength with +DI/-DI crossovers for entry signals
// Only trades when ADX > 25 (trending market, not ranging)
// Source: QuantifiedStrategies, CMC Markets 2025 research

import { BaseStrategy, type Signal, type StrategyMetadata, type RiskProfile } from "../_base/strategy-interface.js";
import type { Candle } from "../../indicators/index.js";
import * as indicators from "../../indicators/index.js";

class ADXTrendFollowingStrategy extends BaseStrategy {
  id = "trend/adx-trend-following-v1";
  name = "ADX Trend Following";
  description = "Trades strong trends using ADX > 25 threshold with +DI/-DI crossover confirmation";
  category = "trend" as const;

  // ADX parameters
  private adxPeriod = 14;
  private minADX = 25; // Minimum ADX for trending market
  private strongTrendADX = 40; // Strong trend threshold

  // EMA trend filter
  private emaPeriod = 50;

  getMetadata(): StrategyMetadata {
    return {
      minDataPoints: 60,
      preferredIntervals: [60, 240, 1440], // 1h, 4h, 1d best for trend following
      suitableMarketConditions: ["trending"],
      complexity: "simple",
      author: "claude-iteration-1-v10",
      version: "1.0.0",
      createdAt: new Date().toISOString(),
    };
  }

  getRiskProfile(): RiskProfile {
    return {
      atrMultiplierSL: 2.0,
      atrMultiplierTP: 4.0,
      minSLPercent: 2.0,
      maxSLPercent: 6.0,
      minTPPercent: 4.0,
      maxTPPercent: 15.0,
    };
  }

  async analyze(candles: Candle[]): Promise<Signal> {
    if (candles.length < this.emaPeriod + 10) {
      return "hold";
    }

    const closes = candles.map(c => c.close);

    // Calculate ADX with +DI/-DI
    const adxResult = indicators.ADX(candles, this.adxPeriod);

    // Calculate EMA for trend direction
    const ema = indicators.EMA(closes, this.emaPeriod);

    const i = candles.length - 1;
    const currentADX = adxResult.adx[i];
    const prevADX = adxResult.adx[i - 1];
    const currentPlusDI = adxResult.plusDI[i];
    const prevPlusDI = adxResult.plusDI[i - 1];
    const currentMinusDI = adxResult.minusDI[i];
    const prevMinusDI = adxResult.minusDI[i - 1];
    const currentEMA = ema[i];
    const currentClose = closes[i];

    // Skip if not ready
    if (isNaN(currentADX) || isNaN(currentEMA) || isNaN(currentPlusDI)) {
      return "hold";
    }

    // Only trade when ADX shows trending market
    if (currentADX < this.minADX) {
      return "hold";
    }

    // Trend direction from EMA
    const isAboveEMA = currentClose > currentEMA;
    const isBelowEMA = currentClose < currentEMA;

    // +DI/-DI crossovers
    const bullishCrossover = prevPlusDI <= prevMinusDI && currentPlusDI > currentMinusDI;
    const bearishCrossover = prevPlusDI >= prevMinusDI && currentPlusDI < currentMinusDI;

    // ADX rising indicates strengthening trend
    const adxRising = currentADX > prevADX;

    // +DI dominant (bullish) vs -DI dominant (bearish)
    const plusDIDominant = currentPlusDI > currentMinusDI;
    const minusDIDominant = currentMinusDI > currentPlusDI;

    // BUY signals
    if (plusDIDominant && isAboveEMA) {
      // Fresh bullish crossover with strong ADX
      if (bullishCrossover && currentADX >= this.minADX) {
        return "buy";
      }
      // Strong trend continuation
      if (currentADX >= this.strongTrendADX && adxRising && currentPlusDI > currentMinusDI * 1.2) {
        return "buy";
      }
    }

    // SELL signals
    if (minusDIDominant && isBelowEMA) {
      // Fresh bearish crossover with strong ADX
      if (bearishCrossover && currentADX >= this.minADX) {
        return "sell";
      }
      // Strong downtrend continuation
      if (currentADX >= this.strongTrendADX && adxRising && currentMinusDI > currentPlusDI * 1.2) {
        return "sell";
      }
    }

    return "hold";
  }
}

export default new ADXTrendFollowingStrategy();
