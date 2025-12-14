// Squeeze Breakout Strategy V10
// TTM Squeeze variant - detects when BB is inside Keltner (low volatility squeeze)
// Breakout from squeeze often leads to strong directional moves
// Based on John Carter's "TTM Squeeze" from Mastering the Trade

import { BaseStrategy, type Signal, type StrategyMetadata, type RiskProfile } from "../_base/strategy-interface.js";
import type { Candle } from "../../indicators/index.js";
import * as indicators from "../../indicators/index.js";

class SqueezeBreakoutV10Strategy extends BaseStrategy {
  id = "momentum/squeeze-breakout-v10";
  name = "Squeeze Breakout V10";
  description = "TTM Squeeze variant - enters on breakout from low volatility consolidation when BB exits Keltner Channel";
  category = "momentum" as const;

  // Squeeze detection parameters
  private bbPeriod = 20;
  private bbStdDev = 2;
  private kcPeriod = 20;
  private kcMultiplier = 1.5;

  // Momentum confirmation
  private rsiPeriod = 14;
  private momentumPeriod = 12;

  // Minimum squeeze duration before breakout
  private minSqueezeBars = 3;

  getMetadata(): StrategyMetadata {
    return {
      minDataPoints: 50,
      preferredIntervals: [15, 60, 240],
      suitableMarketConditions: ["trending", "volatile"],
      complexity: "moderate",
      author: "claude-iteration-v10",
      version: "10.0.0",
      createdAt: new Date().toISOString(),
    };
  }

  getRiskProfile(): RiskProfile {
    return {
      atrMultiplierSL: 1.5,
      atrMultiplierTP: 4.0,
      minSLPercent: 1.5,
      maxSLPercent: 5.0,
      minTPPercent: 3.0,
      maxTPPercent: 15.0,
    };
  }

  // Check if in squeeze (BB inside KC)
  private isInSqueeze(bbUpper: number, bbLower: number, kcUpper: number, kcLower: number): boolean {
    return bbLower > kcLower && bbUpper < kcUpper;
  }

  // Count consecutive squeeze bars
  private countSqueezeBars(candles: Candle[], bb: indicators.BollingerResult, kc: { upper: number[], middle: number[], lower: number[] }): number {
    let count = 0;
    for (let j = candles.length - 2; j >= 0; j--) {
      if (isNaN(bb.upper[j]) || isNaN(kc.upper[j])) break;
      if (this.isInSqueeze(bb.upper[j], bb.lower[j], kc.upper[j], kc.lower[j])) {
        count++;
      } else {
        break;
      }
    }
    return count;
  }

  async analyze(candles: Candle[]): Promise<Signal> {
    if (candles.length < this.bbPeriod + 10) {
      return "hold";
    }

    const i = candles.length - 1;
    const closes = candles.map(c => c.close);

    // Calculate Bollinger Bands
    const bb = indicators.BollingerBands(closes, this.bbPeriod, this.bbStdDev);

    // Calculate Keltner Channels
    const kc = indicators.KeltnerChannel(candles, this.kcPeriod, this.kcPeriod, this.kcMultiplier);

    // Skip if not ready
    if (isNaN(bb.upper[i]) || isNaN(kc.upper[i])) {
      return "hold";
    }

    // Check current and previous squeeze status
    const wasInSqueeze = this.isInSqueeze(bb.upper[i - 1], bb.lower[i - 1], kc.upper[i - 1], kc.lower[i - 1]);
    const isCurrentlyInSqueeze = this.isInSqueeze(bb.upper[i], bb.lower[i], kc.upper[i], kc.lower[i]);

    // Count how long we've been in squeeze
    const squeezeDuration = this.countSqueezeBars(candles, bb, kc);

    // Squeeze release detection (was in squeeze, now out)
    const squeezeRelease = wasInSqueeze && !isCurrentlyInSqueeze && squeezeDuration >= this.minSqueezeBars;

    if (!squeezeRelease) {
      return "hold";
    }

    // Calculate momentum for direction
    const momentum = indicators.Momentum(closes, this.momentumPeriod);
    const currentMomentum = momentum[i];
    const prevMomentum = momentum[i - 1];

    // RSI for confirmation
    const rsi = indicators.RSI_Simple(closes, this.rsiPeriod);
    const currentRSI = rsi[i];

    // Price position relative to midlines
    const aboveBBMiddle = closes[i] > bb.middle[i];
    const aboveKCMiddle = closes[i] > kc.middle[i];

    // Momentum direction
    const momentumRising = currentMomentum > 0 && currentMomentum > prevMomentum;
    const momentumFalling = currentMomentum < 0 && currentMomentum < prevMomentum;

    // Bullish breakout: squeeze release + positive momentum + above midlines
    if (squeezeRelease && momentumRising && aboveBBMiddle && aboveKCMiddle && currentRSI < 75) {
      return "buy";
    }

    // Bearish breakout: squeeze release + negative momentum + below midlines
    if (squeezeRelease && momentumFalling && !aboveBBMiddle && !aboveKCMiddle && currentRSI > 25) {
      return "sell";
    }

    return "hold";
  }
}

export default new SqueezeBreakoutV10Strategy();
