// True Strength Index (TSI) Momentum Strategy
// Uses double-smoothed momentum for cleaner signals with less whipsaws
// Combines TSI crossovers with zero-line confirmation

import { BaseStrategy, type Signal, type StrategyMetadata, type RiskProfile } from "../_base/strategy-interface.js";
import type { Candle } from "../../indicators/index.js";
import * as indicators from "../../indicators/index.js";

class TSIMomentumStrategy extends BaseStrategy {
  id = "momentum/tsi-momentum-v1";
  name = "TSI Momentum";
  description = "Double-smoothed momentum using True Strength Index for reduced noise and cleaner trend signals";
  category = "momentum" as const;

  private longPeriod = 25;
  private shortPeriod = 13;
  private signalPeriod = 7;
  private extremeHigh = 25; // Overbought level
  private extremeLow = -25; // Oversold level

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
      maxTPPercent: 12.0,
    };
  }

  async analyze(candles: Candle[]): Promise<Signal> {
    if (candles.length < this.longPeriod + this.shortPeriod + 10) {
      return "hold";
    }

    const closes = candles.map(c => c.close);
    const i = candles.length - 1;
    const prev = i - 1;

    // Calculate TSI
    const { tsi, signal } = indicators.TrueStrengthIndex(
      closes,
      this.longPeriod,
      this.shortPeriod,
      this.signalPeriod
    );

    const currentTSI = tsi[i];
    const prevTSI = tsi[i - 1];
    const currentSignal = signal[i];
    const prevSignal = signal[i - 1];

    // Skip if not ready
    if (isNaN(currentTSI) || isNaN(currentSignal)) {
      return "hold";
    }

    // Signal line crossovers
    const bullishCross = prevTSI <= prevSignal && currentTSI > currentSignal;
    const bearishCross = prevTSI >= prevSignal && currentTSI < currentSignal;

    // Zero line crossovers (trend confirmation)
    const aboveZero = currentTSI > 0;
    const belowZero = currentTSI < 0;
    const crossingAboveZero = prevTSI <= 0 && currentTSI > 0;
    const crossingBelowZero = prevTSI >= 0 && currentTSI < 0;

    // Extreme levels
    const isOverbought = currentTSI > this.extremeHigh;
    const isOversold = currentTSI < this.extremeLow;

    // BUY signals:
    // 1. Bullish signal crossover above zero line
    // 2. Bullish signal crossover from oversold area
    // 3. TSI crossing above zero with rising momentum
    if (bullishCross && aboveZero) {
      return "buy";
    }

    if (bullishCross && isOversold && currentTSI > prevTSI) {
      return "buy";
    }

    if (crossingAboveZero && currentTSI > currentSignal) {
      return "buy";
    }

    // SELL signals:
    // 1. Bearish signal crossover below zero line
    // 2. Bearish signal crossover from overbought area
    // 3. TSI crossing below zero with falling momentum
    if (bearishCross && belowZero) {
      return "sell";
    }

    if (bearishCross && isOverbought && currentTSI < prevTSI) {
      return "sell";
    }

    if (crossingBelowZero && currentTSI < currentSignal) {
      return "sell";
    }

    return "hold";
  }
}

export default new TSIMomentumStrategy();
