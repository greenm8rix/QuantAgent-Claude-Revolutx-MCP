// KST + ADX Power Strategy V10
// Combines Know Sure Thing (multi-timeframe ROC) with ADX trend strength
// Based on V9 finding: adx_kst_trend hit 85.7% win rate, 79.51% PnL
// This is an optimized version with additional filters

import { BaseStrategy, type Signal, type StrategyMetadata, type RiskProfile } from "../_base/strategy-interface.js";
import type { Candle } from "../../indicators/index.js";
import * as indicators from "../../indicators/index.js";

class KSTADXPowerStrategy extends BaseStrategy {
  id = "momentum/kst-adx-power-v10";
  name = "KST ADX Power";
  description = "Multi-timeframe momentum (KST) with strong trend filter (ADX) - based on top V9 performer";
  category = "momentum" as const;

  // ADX parameters
  private adxPeriod = 14;
  private adxStrongTrend = 25;
  private adxVeryStrongTrend = 35;

  // EMA for trend direction
  private emaPeriod = 21;

  // Volume filter
  private volumePeriod = 20;
  private volumeMultiplier = 1.1;

  getMetadata(): StrategyMetadata {
    return {
      minDataPoints: 60,
      preferredIntervals: [60, 240], // 1h and 4h best
      suitableMarketConditions: ["trending"],
      complexity: "moderate",
      author: "claude-iteration-v10",
      version: "10.0.0",
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
    if (candles.length < 50) {
      return "hold";
    }

    const i = candles.length - 1;
    const closes = candles.map(c => c.close);
    const volumes = candles.map(c => c.volume);

    // Calculate KST (Know Sure Thing)
    const { kst, signal: kstSignal } = indicators.KnowSureThing(closes);
    const currentKST = kst[i];
    const prevKST = kst[i - 1];
    const currentKSTSignal = kstSignal[i];
    const prevKSTSignal = kstSignal[i - 1];

    // Calculate ADX
    const { adx, plusDI, minusDI } = indicators.ADX(candles, this.adxPeriod);
    const currentADX = adx[i];
    const currentPlusDI = plusDI[i];
    const currentMinusDI = minusDI[i];

    // Skip if indicators not ready
    if (isNaN(currentKST) || isNaN(currentADX)) {
      return "hold";
    }

    // EMA trend
    const ema = indicators.EMA(closes, this.emaPeriod);
    const aboveEma = closes[i] > ema[i];

    // Volume confirmation
    const volumeSMA = indicators.SMA(volumes, this.volumePeriod);
    const isHighVolume = volumes[i] > volumeSMA[i] * this.volumeMultiplier;

    // ADX trend strength
    const isStrongTrend = currentADX > this.adxStrongTrend;
    const isVeryStrongTrend = currentADX > this.adxVeryStrongTrend;

    // DI direction
    const bullishDI = currentPlusDI > currentMinusDI;
    const bearishDI = currentMinusDI > currentPlusDI;

    // KST crossover signals
    const kstBullishCross = prevKST <= prevKSTSignal && currentKST > currentKSTSignal;
    const kstBearishCross = prevKST >= prevKSTSignal && currentKST < currentKSTSignal;

    // KST momentum direction
    const kstRising = currentKST > prevKST;
    const kstFalling = currentKST < prevKST;

    // KST zero line cross
    const kstAboveZero = currentKST > 0;
    const kstBelowZero = currentKST < 0;

    // Bullish conditions:
    // Strong: KST bullish cross + strong ADX + bullish DI + above EMA
    // Medium: KST rising above zero + very strong ADX + bullish DI
    const strongBullish = kstBullishCross && isStrongTrend && bullishDI && aboveEma;
    const mediumBullish = kstRising && kstAboveZero && isVeryStrongTrend && bullishDI && aboveEma;

    if (strongBullish || mediumBullish) {
      return "buy";
    }

    // Bearish conditions:
    // Strong: KST bearish cross + strong ADX + bearish DI + below EMA
    // Medium: KST falling below zero + very strong ADX + bearish DI
    const strongBearish = kstBearishCross && isStrongTrend && bearishDI && !aboveEma;
    const mediumBearish = kstFalling && kstBelowZero && isVeryStrongTrend && bearishDI && !aboveEma;

    if (strongBearish || mediumBearish) {
      return "sell";
    }

    return "hold";
  }
}

export default new KSTADXPowerStrategy();
