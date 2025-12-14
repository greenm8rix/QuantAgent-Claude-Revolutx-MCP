// TTM Squeeze Breakout Strategy
// Based on John Carter's TTM Squeeze - detects low volatility squeeze then trades breakout
// Squeeze: When Bollinger Bands are inside Keltner Channels
// Trade: When squeeze fires (BB exits KC) with momentum direction
// Source: TrendSpider, StockCharts TTM Squeeze methodology

import { BaseStrategy, type Signal, type StrategyMetadata, type RiskProfile } from "../_base/strategy-interface.js";
import type { Candle } from "../../indicators/index.js";
import * as indicators from "../../indicators/index.js";

class TTMSqueezeBreakoutStrategy extends BaseStrategy {
  id = "momentum/ttm-squeeze-breakout-v1";
  name = "TTM Squeeze Breakout";
  description = "Trades breakouts after Bollinger Bands exit Keltner Channels with momentum confirmation";
  category = "momentum" as const;

  // TTM Squeeze parameters (John Carter defaults)
  private bbPeriod = 20;
  private bbMult = 2.0;
  private kcPeriod = 20;
  private kcMult = 1.5;
  private momentumPeriod = 12;

  // Signal confirmation
  private minSqueezeCandles = 3; // Minimum candles in squeeze before trade

  getMetadata(): StrategyMetadata {
    return {
      minDataPoints: 50,
      preferredIntervals: [60, 240, 1440], // 1h, 4h, 1d work best
      suitableMarketConditions: ["volatile", "trending"],
      complexity: "moderate",
      author: "claude-iteration-1-v10",
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
      maxTPPercent: 10.0,
    };
  }

  async analyze(candles: Candle[]): Promise<Signal> {
    if (candles.length < this.bbPeriod + this.minSqueezeCandles + 5) {
      return "hold";
    }

    const closes = candles.map(c => c.close);

    // Calculate Bollinger Bands
    const bb = indicators.BollingerBands(closes, this.bbPeriod, this.bbMult);

    // Calculate Keltner Channels
    const kc = indicators.KeltnerChannel(candles, this.kcPeriod, this.kcPeriod, this.kcMult);

    // Detect squeeze state for recent candles
    const squeezeStates: boolean[] = [];
    for (let i = Math.max(0, candles.length - 10); i < candles.length; i++) {
      if (isNaN(bb.upper[i]) || isNaN(kc.upper[i])) {
        squeezeStates.push(false);
        continue;
      }
      // Squeeze is ON when BB is inside KC
      const isInSqueeze = bb.lower[i] > kc.lower[i] && bb.upper[i] < kc.upper[i];
      squeezeStates.push(isInSqueeze);
    }

    const currentIdx = candles.length - 1;
    const currentSqueeze = squeezeStates[squeezeStates.length - 1];
    const prevSqueeze = squeezeStates[squeezeStates.length - 2];

    // Count consecutive squeeze candles before potential fire
    let squeezeCount = 0;
    for (let i = squeezeStates.length - 2; i >= 0; i--) {
      if (squeezeStates[i]) {
        squeezeCount++;
      } else {
        break;
      }
    }

    // Calculate momentum (price relative to BB midline)
    const midline = (bb.upper[currentIdx] + bb.lower[currentIdx]) / 2;
    const currentMomentum = closes[currentIdx] - midline;
    const prevMomentum = closes[currentIdx - 1] - ((bb.upper[currentIdx - 1] + bb.lower[currentIdx - 1]) / 2);

    // Squeeze FIRES when BB exits KC (was in squeeze, now not)
    const squeezeFired = prevSqueeze && !currentSqueeze;

    // Also check for momentum breakout while still in squeeze but about to fire
    const momentumAccelerating = Math.abs(currentMomentum) > Math.abs(prevMomentum) * 1.2;

    // Entry signals
    if (squeezeFired && squeezeCount >= this.minSqueezeCandles) {
      // Squeeze just fired - trade in momentum direction
      if (currentMomentum > 0 && currentMomentum > prevMomentum) {
        return "buy";
      }
      if (currentMomentum < 0 && currentMomentum < prevMomentum) {
        return "sell";
      }
    }

    // Alternative: Strong momentum while approaching squeeze exit
    if (prevSqueeze && momentumAccelerating && squeezeCount >= this.minSqueezeCandles) {
      // Check if bands are expanding (about to fire)
      const bbWidth = bb.upper[currentIdx] - bb.lower[currentIdx];
      const prevBBWidth = bb.upper[currentIdx - 1] - bb.lower[currentIdx - 1];

      if (bbWidth > prevBBWidth * 1.05) {
        if (currentMomentum > 0) {
          return "buy";
        }
        if (currentMomentum < 0) {
          return "sell";
        }
      }
    }

    return "hold";
  }
}

export default new TTMSqueezeBreakoutStrategy();
