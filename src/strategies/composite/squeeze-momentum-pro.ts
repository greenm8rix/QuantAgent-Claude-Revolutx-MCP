// Squeeze Momentum Pro Strategy
// Based on TTM Squeeze (John Carter) - detects low volatility before explosive moves
// BB inside Keltner = "squeeze" condition, release = potential breakout
// Enhanced with RSI and ADX filters for higher probability entries

import { BaseStrategy, type Signal, type StrategyMetadata, type RiskProfile } from "../_base/strategy-interface.js";
import type { Candle } from "../../indicators/index.js";
import * as indicators from "../../indicators/index.js";

class SqueezeProStrategy extends BaseStrategy {
  id = "composite/squeeze-momentum-pro-v1";
  name = "Squeeze Momentum Pro";
  description = "Captures explosive moves after volatility squeeze using BB/Keltner relationship with momentum confirmation";
  category = "composite" as const;

  // Bollinger Bands parameters
  private bbPeriod = 20;
  private bbMult = 2.0;

  // Keltner Channel parameters
  private kcPeriod = 20;
  private kcMult = 1.5;

  // Momentum calculation
  private momentumPeriod = 12;

  // Filters
  private rsiPeriod = 14;
  private adxPeriod = 14;
  private minADX = 20; // Minimum trend strength for breakout

  // Squeeze tracking
  private minSqueezeBars = 3; // Minimum bars in squeeze before valid signal

  getMetadata(): StrategyMetadata {
    return {
      minDataPoints: 60,
      preferredIntervals: [15, 60, 240],
      suitableMarketConditions: ["ranging", "volatile"],
      complexity: "complex",
      author: "claude-iteration-1",
      version: "1.0.0",
      createdAt: new Date().toISOString(),
    };
  }

  getRiskProfile(): RiskProfile {
    return {
      atrMultiplierSL: 2.0, // Wider stops for breakout plays
      atrMultiplierTP: 4.0,
      minSLPercent: 2.0,
      maxSLPercent: 6.0,
      minTPPercent: 4.0,
      maxTPPercent: 15.0,
    };
  }

  private detectSqueeze(candles: Candle[]): { inSqueeze: boolean; squeezeBars: number; momentum: number; momentumRising: boolean } {
    const closes = candles.map(c => c.close);
    const i = candles.length - 1;

    // Calculate BB and KC
    const bb = indicators.BollingerBands(closes, this.bbPeriod, this.bbMult);
    const kc = indicators.KeltnerChannel(candles, this.kcPeriod, this.kcPeriod, this.kcMult);

    // Check if BB is inside KC (squeeze)
    const inSqueeze = bb.lower[i] > kc.lower[i] && bb.upper[i] < kc.upper[i];

    // Count consecutive squeeze bars
    let squeezeBars = 0;
    for (let j = i; j >= 0 && j > i - 20; j--) {
      const bbInKc = bb.lower[j] > kc.lower[j] && bb.upper[j] < kc.upper[j];
      if (bbInKc) {
        squeezeBars++;
      } else {
        break;
      }
    }

    // Calculate momentum (price vs linear regression / midline)
    const midline = (bb.upper[i] + bb.lower[i]) / 2;
    const momentum = closes[i] - midline;
    const prevMidline = (bb.upper[i - 1] + bb.lower[i - 1]) / 2;
    const prevMomentum = closes[i - 1] - prevMidline;
    const momentumRising = momentum > prevMomentum;

    return { inSqueeze, squeezeBars, momentum, momentumRising };
  }

  async analyze(candles: Candle[]): Promise<Signal> {
    if (candles.length < this.bbPeriod + 20) {
      return "hold";
    }

    const closes = candles.map(c => c.close);
    const i = candles.length - 1;

    // Detect squeeze state
    const current = this.detectSqueeze(candles);
    const prev = this.detectSqueeze(candles.slice(0, -1));

    // Calculate filters
    const rsi = indicators.RSI_Simple(closes, this.rsiPeriod);
    const { adx } = indicators.ADX(candles, this.adxPeriod);

    const currentRSI = rsi[i];
    const currentADX = adx[i];

    // Skip if indicators not ready
    if (isNaN(currentRSI) || isNaN(currentADX)) {
      return "hold";
    }

    // === SQUEEZE RELEASE DETECTION ===
    // Was in squeeze, now released
    const squeezeJustReleased = prev.inSqueeze && !current.inSqueeze;
    const hadSufficientSqueeze = prev.squeezeBars >= this.minSqueezeBars;

    // === MOMENTUM DIRECTION ===
    const bullishMomentum = current.momentum > 0 && current.momentumRising;
    const bearishMomentum = current.momentum < 0 && !current.momentumRising;

    // === RSI CONFIRMATION ===
    const rsiBullish = currentRSI > 50 && currentRSI < 75; // Not overbought
    const rsiBearish = currentRSI < 50 && currentRSI > 25; // Not oversold

    // === ADX TREND STRENGTH ===
    const trendStrengthOK = currentADX > this.minADX;

    // === PRIMARY SIGNAL: SQUEEZE RELEASE ===
    if (squeezeJustReleased && hadSufficientSqueeze) {
      // Bullish breakout from squeeze
      if (bullishMomentum && rsiBullish && trendStrengthOK) {
        return "buy";
      }

      // Bearish breakdown from squeeze
      if (bearishMomentum && rsiBearish && trendStrengthOK) {
        return "sell";
      }

      // Even without ADX, strong momentum on release is significant
      if (bullishMomentum && rsiBullish && prev.squeezeBars >= 5) {
        return "buy";
      }

      if (bearishMomentum && rsiBearish && prev.squeezeBars >= 5) {
        return "sell";
      }
    }

    // === SECONDARY SIGNAL: MOMENTUM SHIFT DURING SQUEEZE ===
    // While in squeeze, momentum shift can precede breakout
    if (current.inSqueeze && current.squeezeBars >= this.minSqueezeBars) {
      // Momentum just turned positive while in squeeze
      const momentumTurnedBullish = prev.momentum <= 0 && current.momentum > 0;
      const momentumTurnedBearish = prev.momentum >= 0 && current.momentum < 0;

      // Early entry on momentum shift if RSI confirms
      if (momentumTurnedBullish && rsiBullish && current.momentumRising) {
        return "buy";
      }

      if (momentumTurnedBearish && rsiBearish && !current.momentumRising) {
        return "sell";
      }
    }

    // === TERTIARY: POST-SQUEEZE CONTINUATION ===
    // Just released from squeeze and momentum continuing
    if (!current.inSqueeze && !prev.inSqueeze && prev.squeezeBars === 0) {
      // Check 2-bars-ago for recent squeeze release
      const twoBarsAgo = this.detectSqueeze(candles.slice(0, -2));
      const recentRelease = twoBarsAgo.inSqueeze && twoBarsAgo.squeezeBars >= this.minSqueezeBars;

      if (recentRelease && current.momentumRising && bullishMomentum && trendStrengthOK) {
        return "buy";
      }

      if (recentRelease && !current.momentumRising && bearishMomentum && trendStrengthOK) {
        return "sell";
      }
    }

    return "hold";
  }
}

export default new SqueezeProStrategy();
