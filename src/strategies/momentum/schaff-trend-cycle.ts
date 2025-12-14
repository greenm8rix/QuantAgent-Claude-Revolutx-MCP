// Schaff Trend Cycle (STC) Strategy
// Combines MACD speed with Stochastic smoothness for faster trend detection
// STC oscillates 0-100, using 25/75 levels for signals

import { BaseStrategy, type Signal, type StrategyMetadata, type RiskProfile } from "../_base/strategy-interface.js";
import type { Candle } from "../../indicators/index.js";
import * as indicators from "../../indicators/index.js";

class SchaffTrendCycleStrategy extends BaseStrategy {
  id = "momentum/schaff-trend-cycle-v1";
  name = "Schaff Trend Cycle";
  description = "Fast trend detection combining MACD with double stochastic smoothing for cleaner signals";
  category = "momentum" as const;

  // STC optimized for crypto
  private fastPeriod = 23;
  private slowPeriod = 50;
  private cyclePeriod = 10;
  private overbought = 75;
  private oversold = 25;

  getMetadata(): StrategyMetadata {
    return {
      minDataPoints: 60,
      preferredIntervals: [15, 60, 240],
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
      minSLPercent: 1.0,
      maxSLPercent: 4.0,
      minTPPercent: 2.0,
      maxTPPercent: 10.0,
    };
  }

  async analyze(candles: Candle[]): Promise<Signal> {
    if (candles.length < this.slowPeriod + this.cyclePeriod * 3) {
      return "hold";
    }

    const closes = candles.map(c => c.close);
    const i = candles.length - 1;

    // Calculate STC
    const stc = indicators.SchaffTrendCycle(
      closes,
      this.fastPeriod,
      this.slowPeriod,
      this.cyclePeriod
    );

    const currentSTC = stc[i];
    const prevSTC = stc[i - 1];
    const prev2STC = stc[i - 2];

    // Skip if not ready
    if (isNaN(currentSTC) || isNaN(prevSTC) || isNaN(prev2STC)) {
      return "hold";
    }

    // Trend direction
    const stcRising = currentSTC > prevSTC;
    const stcFalling = currentSTC < prevSTC;
    const stcAcceleratingUp = currentSTC - prevSTC > prevSTC - prev2STC;
    const stcAcceleratingDown = currentSTC - prevSTC < prevSTC - prev2STC;

    // Zone detection
    const inOversold = currentSTC < this.oversold;
    const inOverbought = currentSTC > this.overbought;
    const crossingUp25 = prevSTC <= this.oversold && currentSTC > this.oversold;
    const crossingDown75 = prevSTC >= this.overbought && currentSTC < this.overbought;

    // Middle zone crossovers
    const crossingUp50 = prevSTC <= 50 && currentSTC > 50;
    const crossingDown50 = prevSTC >= 50 && currentSTC < 50;

    // BUY signals:
    // 1. STC crossing above 25 from oversold (strong reversal)
    // 2. STC crossing above 50 (trend confirmation)
    // 3. STC rising from oversold with acceleration
    if (crossingUp25 && stcRising) {
      return "buy";
    }

    if (crossingUp50 && stcAcceleratingUp) {
      return "buy";
    }

    if (inOversold && stcRising && stcAcceleratingUp && currentSTC > 10) {
      return "buy";
    }

    // SELL signals:
    // 1. STC crossing below 75 from overbought (strong reversal)
    // 2. STC crossing below 50 (trend confirmation)
    // 3. STC falling from overbought with acceleration
    if (crossingDown75 && stcFalling) {
      return "sell";
    }

    if (crossingDown50 && stcAcceleratingDown) {
      return "sell";
    }

    if (inOverbought && stcFalling && stcAcceleratingDown && currentSTC < 90) {
      return "sell";
    }

    return "hold";
  }
}

export default new SchaffTrendCycleStrategy();
