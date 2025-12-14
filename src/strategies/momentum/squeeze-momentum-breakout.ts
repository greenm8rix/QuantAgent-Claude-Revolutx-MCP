// Squeeze Momentum Breakout Strategy
// Based on TTM Squeeze indicator - trades breakouts from low volatility periods
// When BB is inside Keltner Channel = squeeze (consolidation)
// Breakout from squeeze with momentum confirmation = high probability trade

import { BaseStrategy, type Signal, type StrategyMetadata, type RiskProfile } from "../_base/strategy-interface.js";
import type { Candle } from "../../indicators/index.js";
import * as indicators from "../../indicators/index.js";

class SqueezeMomentumBreakoutStrategy extends BaseStrategy {
  id = "momentum/squeeze-momentum-breakout-v1";
  name = "Squeeze Momentum Breakout";
  description = "Captures explosive moves when price breaks out of low volatility squeeze conditions";
  category = "momentum" as const;

  // TTM Squeeze parameters
  private bbPeriod = 20;
  private bbMult = 2.0;
  private kcPeriod = 20;
  private kcMult = 1.5;
  private momentumPeriod = 12;

  getMetadata(): StrategyMetadata {
    return {
      minDataPoints: 50,
      preferredIntervals: [15, 60, 240],
      suitableMarketConditions: ["volatile", "trending"],
      complexity: "moderate",
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
    if (candles.length < this.kcPeriod + 10) {
      return "hold";
    }

    // Use SqueezeMomentum indicator
    const squeeze = indicators.SqueezeMomentum(
      candles,
      this.bbPeriod,
      this.bbMult,
      this.kcPeriod,
      this.kcMult
    );

    const i = candles.length - 1;
    const prev = i - 1;
    const prev2 = i - 2;

    // Get squeeze states
    const currentSqueeze = squeeze.squeeze[i];
    const prevSqueeze = squeeze.squeeze[prev];
    const prev2Squeeze = squeeze.squeeze[prev2];

    // Get momentum values
    const currentMomentum = squeeze.momentum[i];
    const prevMomentum = squeeze.momentum[prev];
    const prev2Momentum = squeeze.momentum[prev2];

    // Detect squeeze release (was in squeeze, now released)
    const squeezeJustReleased = !currentSqueeze && prevSqueeze;
    const wasInSqueezeRecently = prevSqueeze || prev2Squeeze;

    // Momentum direction and acceleration
    const momentumBullish = currentMomentum > 0;
    const momentumBearish = currentMomentum < 0;
    const momentumAccelerating = Math.abs(currentMomentum) > Math.abs(prevMomentum);
    const momentumTurningBullish = currentMomentum > prevMomentum && prevMomentum <= prev2Momentum;
    const momentumTurningBearish = currentMomentum < prevMomentum && prevMomentum >= prev2Momentum;

    // BUY: Squeeze released + positive momentum + accelerating
    if (squeezeJustReleased && momentumBullish && momentumAccelerating) {
      return "buy";
    }

    // Alternative BUY: Recently in squeeze + momentum turning bullish from negative
    if (wasInSqueezeRecently && momentumTurningBullish && currentMomentum > 0 && prevMomentum < 0) {
      return "buy";
    }

    // SELL: Squeeze released + negative momentum + accelerating
    if (squeezeJustReleased && momentumBearish && momentumAccelerating) {
      return "sell";
    }

    // Alternative SELL: Recently in squeeze + momentum turning bearish from positive
    if (wasInSqueezeRecently && momentumTurningBearish && currentMomentum < 0 && prevMomentum > 0) {
      return "sell";
    }

    return "hold";
  }
}

export default new SqueezeMomentumBreakoutStrategy();
