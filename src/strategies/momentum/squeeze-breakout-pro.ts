// Squeeze Breakout Pro Strategy
// Based on TTM Squeeze indicator - detects volatility compression followed by breakouts
// Uses BB inside Keltner Channel detection + momentum confirmation

import { BaseStrategy, type Signal, type StrategyMetadata, type RiskProfile } from "../_base/strategy-interface.js";
import type { Candle } from "../../indicators/index.js";
import * as indicators from "../../indicators/index.js";

class SqueezeBreakoutProStrategy extends BaseStrategy {
  id = "momentum/squeeze-breakout-pro-v1";
  name = "Squeeze Breakout Pro";
  description = "TTM Squeeze-based volatility compression breakout with momentum confirmation";
  category = "momentum" as const;

  // Squeeze detection parameters
  private bbPeriod = 20;
  private bbStdDev = 2.0;
  private kcPeriod = 20;
  private kcMultiplier = 1.5;
  private momentumPeriod = 12;
  private minSqueezeCandles = 3; // Require at least 3 candles in squeeze

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

  private detectSqueeze(candles: Candle[]): boolean[] {
    const closes = candles.map(c => c.close);
    const bb = indicators.BollingerBands(closes, this.bbPeriod, this.bbStdDev);
    const kc = indicators.KeltnerChannel(candles, this.kcPeriod, this.kcPeriod, this.kcMultiplier);

    const inSqueeze: boolean[] = [];
    for (let i = 0; i < candles.length; i++) {
      if (isNaN(bb.upper[i]) || isNaN(kc.upper[i])) {
        inSqueeze.push(false);
        continue;
      }
      // BB inside KC = squeeze is ON
      const squeeze = bb.lower[i] > kc.lower[i] && bb.upper[i] < kc.upper[i];
      inSqueeze.push(squeeze);
    }
    return inSqueeze;
  }

  async analyze(candles: Candle[]): Promise<Signal> {
    if (candles.length < 50) return "hold";

    const closes = candles.map(c => c.close);
    const i = candles.length - 1;

    // Detect squeeze states
    const squeezeStates = this.detectSqueeze(candles);

    // Count consecutive squeeze candles before current
    let squeezeCount = 0;
    for (let j = i - 1; j >= 0 && squeezeStates[j]; j--) {
      squeezeCount++;
    }

    // Current candle is NOT in squeeze (squeeze just "fired")
    const squeezeFired = !squeezeStates[i] && squeezeCount >= this.minSqueezeCandles;

    if (!squeezeFired) {
      return "hold";
    }

    // Calculate momentum (distance from BB midline)
    const bb = indicators.BollingerBands(closes, this.bbPeriod, this.bbStdDev);
    const momentum = closes[i] - bb.middle[i];
    const prevMomentum = closes[i - 1] - bb.middle[i - 1];

    // Also check RSI for confirmation
    const rsi = indicators.RSI_Simple(closes, 14);
    const currentRSI = rsi[i];

    // Volume confirmation
    const volumes = candles.map(c => c.volume);
    const volumeSMA = indicators.SMA(volumes, 20);
    const volumeRatio = volumes[i] / volumeSMA[i];
    const hasVolumeSpike = volumeRatio > 1.2;

    // BULLISH BREAKOUT: Squeeze fired + positive rising momentum
    if (momentum > 0 && momentum > prevMomentum && currentRSI < 75) {
      if (hasVolumeSpike) {
        return "buy";
      }
      // Even without volume, a strong squeeze fire is tradeable
      if (squeezeCount >= 5) {
        return "buy";
      }
    }

    // BEARISH BREAKOUT: Squeeze fired + negative falling momentum
    if (momentum < 0 && momentum < prevMomentum && currentRSI > 25) {
      if (hasVolumeSpike) {
        return "sell";
      }
      if (squeezeCount >= 5) {
        return "sell";
      }
    }

    return "hold";
  }
}

export default new SqueezeBreakoutProStrategy();
