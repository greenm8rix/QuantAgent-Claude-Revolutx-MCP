// ADX Trend Breakout Strategy
// Based on 2025 research: ADX > 25 signals strong trends, +DI/-DI crossovers for direction
// Volume confirmation increases breakout success rate significantly
// Reference: tradingstrategyguides.com, altrady.com ADX guides

import { BaseStrategy, type Signal, type StrategyMetadata, type RiskProfile } from "../_base/strategy-interface.js";
import type { Candle } from "../../indicators/index.js";
import * as indicators from "../../indicators/index.js";

class ADXTrendBreakoutStrategy extends BaseStrategy {
  id = "momentum/adx-trend-breakout-v1";
  name = "ADX Trend Breakout";
  description = "Enters strong trends using ADX breakout above 25 with DI crossovers and volume confirmation";
  category = "momentum" as const;

  // ADX parameters (relaxed for more signals)
  private adxPeriod = 14;
  private adxTrendThreshold = 18; // ADX > 18 = trend (relaxed from 25)
  private adxStrongTrend = 28; // ADX > 28 = strong trend (relaxed from 40)

  // Volume confirmation
  private volumePeriod = 14;
  private volumeMultiplier = 1.0; // Disabled for more signals

  // Trend filter - only trade in direction of momentum
  private emaPeriod = 13;

  getMetadata(): StrategyMetadata {
    return {
      minDataPoints: 60,
      preferredIntervals: [60, 240], // 1h and 4h for trend following
      suitableMarketConditions: ["trending", "volatile"],
      complexity: "moderate",
      author: "claude-iteration-1",
      version: "1.0.0",
      createdAt: new Date().toISOString(),
    };
  }

  getRiskProfile(): RiskProfile {
    return {
      atrMultiplierSL: 2.0, // Wider stops for trend following
      atrMultiplierTP: 4.0, // Let winners run
      minSLPercent: 2.0,
      maxSLPercent: 6.0,
      minTPPercent: 4.0,
      maxTPPercent: 15.0,
    };
  }

  async analyze(candles: Candle[]): Promise<Signal> {
    const minRequired = Math.max(this.adxPeriod * 2, this.volumePeriod) + 5;
    if (candles.length < minRequired) {
      return "hold";
    }

    const closes = candles.map(c => c.close);
    const volumes = candles.map(c => c.volume);
    const i = candles.length - 1;

    // Calculate ADX and DI lines
    const { adx, plusDI, minusDI } = indicators.ADX(candles, this.adxPeriod);

    // EMA for trend direction filter
    const ema = indicators.EMA(closes, this.emaPeriod);

    // Volume SMA for confirmation
    const volumeSMA = indicators.SMA(volumes, this.volumePeriod);

    // Get current and previous values
    const currentADX = adx[i];
    const prevADX = adx[i - 1];
    const currentPlusDI = plusDI[i];
    const prevPlusDI = plusDI[i - 1];
    const currentMinusDI = minusDI[i];
    const prevMinusDI = minusDI[i - 1];
    const currentEMA = ema[i];
    const currentPrice = closes[i];
    const currentVolume = volumes[i];
    const avgVolume = volumeSMA[i];

    // Skip if indicators not ready
    if (isNaN(currentADX) || isNaN(currentPlusDI) || isNaN(currentEMA) || isNaN(avgVolume)) {
      return "hold";
    }

    // Volume confirmation
    const hasVolumeConfirmation = currentVolume > avgVolume * this.volumeMultiplier;

    // ADX trend strength check
    const isTrending = currentADX > this.adxTrendThreshold;
    const adxRising = currentADX > prevADX;

    // DI crossover detection
    const bullishDICross = prevPlusDI <= prevMinusDI && currentPlusDI > currentMinusDI;
    const bearishDICross = prevPlusDI >= prevMinusDI && currentPlusDI < currentMinusDI;

    // Trend direction from EMA
    const priceAboveEMA = currentPrice > currentEMA;
    const priceBelowEMA = currentPrice < currentEMA;

    // LONG: ADX trending + bullish DI cross (or +DI leading) + price above EMA + volume
    const bullishSetup = (
      isTrending &&
      (bullishDICross || (currentPlusDI > currentMinusDI && adxRising)) &&
      priceAboveEMA &&
      (hasVolumeConfirmation || currentADX > this.adxStrongTrend) // Very strong trends don't need volume
    );

    // SHORT: ADX trending + bearish DI cross (or -DI leading) + price below EMA + volume
    const bearishSetup = (
      isTrending &&
      (bearishDICross || (currentMinusDI > currentPlusDI && adxRising)) &&
      priceBelowEMA &&
      (hasVolumeConfirmation || currentADX > this.adxStrongTrend)
    );

    // Prefer fresh crossovers over established leads
    if (bullishDICross && isTrending && priceAboveEMA) {
      return "buy";
    }

    if (bearishDICross && isTrending && priceBelowEMA) {
      return "sell";
    }

    // Secondary: established DI lead with rising ADX
    if (bullishSetup && !bearishSetup) {
      return "buy";
    }

    if (bearishSetup && !bullishSetup) {
      return "sell";
    }

    return "hold";
  }
}

export default new ADXTrendBreakoutStrategy();
