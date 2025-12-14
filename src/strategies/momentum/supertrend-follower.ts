// Supertrend Follower Strategy
// Uses Supertrend indicator for trend following
// Simple but effective on trending markets

import { BaseStrategy, type Signal, type StrategyMetadata, type RiskProfile } from "../_base/strategy-interface.js";
import type { Candle } from "../../indicators/index.js";
import * as indicators from "../../indicators/index.js";

class SupertrendFollowerStrategy extends BaseStrategy {
  id = "momentum/supertrend-follower-v1";
  name = "Supertrend Follower";
  description = "Trend following using Supertrend indicator with ATR-based trailing stops";
  category = "trend" as const;

  private period = 10;
  private multiplier = 2.5; // Slightly tighter for more signals

  getMetadata(): StrategyMetadata {
    return {
      minDataPoints: 30,
      preferredIntervals: [15, 60, 240],
      suitableMarketConditions: ["trending"],
      complexity: "simple",
      author: "claude-iteration-1",
      version: "1.0.0",
      createdAt: new Date().toISOString(),
    };
  }

  getRiskProfile(): RiskProfile {
    return {
      atrMultiplierSL: 2.0,
      atrMultiplierTP: 4.0,
      minSLPercent: 1.5,
      maxSLPercent: 5.0,
      minTPPercent: 3.0,
      maxTPPercent: 12.0,
    };
  }

  async analyze(candles: Candle[]): Promise<Signal> {
    if (candles.length < this.period + 5) {
      return "hold";
    }

    const i = candles.length - 1;

    const { trend, direction } = indicators.Supertrend(candles, this.period, this.multiplier);

    const currentDir = direction[i];
    const prevDir = direction[i - 1];
    const currentClose = candles[i].close;
    const currentTrend = trend[i];

    // Skip if not ready
    if (isNaN(currentDir) || isNaN(prevDir) || isNaN(currentTrend)) {
      return "hold";
    }

    // Trend flip detection
    const bullishFlip = prevDir === -1 && currentDir === 1;
    const bearishFlip = prevDir === 1 && currentDir === -1;

    // Price relative to trend line
    const priceAboveTrend = currentClose > currentTrend;
    const priceBelowTrend = currentClose < currentTrend;

    // BUY: Supertrend flips bullish
    if (bullishFlip) {
      return "buy";
    }

    // SELL: Supertrend flips bearish
    if (bearishFlip) {
      return "sell";
    }

    return "hold";
  }
}

export default new SupertrendFollowerStrategy();
