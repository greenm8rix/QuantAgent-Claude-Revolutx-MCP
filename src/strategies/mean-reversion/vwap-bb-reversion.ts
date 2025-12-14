// VWAP + Bollinger Bands Mean Reversion Strategy
// Based on 2025 research: VWAP directional bias + BB band touches for high-probability reversions
// Long only above VWAP when touching lower BB, Short only below VWAP when touching upper BB

import { BaseStrategy, type Signal, type StrategyMetadata, type RiskProfile } from "../_base/strategy-interface.js";
import type { Candle } from "../../indicators/index.js";
import * as indicators from "../../indicators/index.js";

class VWAPBBReversionStrategy extends BaseStrategy {
  id = "mean-reversion/vwap-bb-reversion-v1";
  name = "VWAP BB Mean Reversion";
  description = "VWAP directional filter with Bollinger Band touch reversions for mean reversion plays";
  category = "mean_reversion" as const;

  // Parameters
  private bbPeriod = 20;
  private bbStdDev = 2;
  private rsiPeriod = 7;
  private rsiOversold = 30;
  private rsiOverbought = 70;
  private vwapPeriod = 21; // Rolling VWAP for crypto (no session resets)

  getMetadata(): StrategyMetadata {
    return {
      minDataPoints: 50,
      preferredIntervals: [15, 60],
      suitableMarketConditions: ["ranging", "volatile"],
      complexity: "moderate",
      author: "claude-iteration-1",
      version: "1.0.0",
      createdAt: new Date().toISOString(),
    };
  }

  getRiskProfile(): RiskProfile {
    return {
      atrMultiplierSL: 1.5,
      atrMultiplierTP: 2.0,
      minSLPercent: 0.8,
      maxSLPercent: 3.0,
      minTPPercent: 1.2,
      maxTPPercent: 5.0,
    };
  }

  async analyze(candles: Candle[]): Promise<Signal> {
    if (candles.length < 50) return "hold";

    const closes = candles.map(c => c.close);
    const i = candles.length - 1;

    // Calculate indicators
    const bb = indicators.BollingerBands(closes, this.bbPeriod, this.bbStdDev);
    const rsi = indicators.RSI_Simple(closes, this.rsiPeriod);
    const vwap = indicators.RollingVWAP(candles, this.vwapPeriod);

    const currentClose = closes[i];
    const currentLow = candles[i].low;
    const currentHigh = candles[i].high;
    const currentRSI = rsi[i];
    const prevRSI = rsi[i - 1];
    const currentVWAP = vwap[i];

    // Skip if indicators not ready
    if (isNaN(bb.lower[i]) || isNaN(currentRSI) || isNaN(currentVWAP)) {
      return "hold";
    }

    // Determine VWAP bias
    const aboveVWAP = currentClose > currentVWAP;
    const belowVWAP = currentClose < currentVWAP;

    // BB band touch detection
    const touchedLowerBB = currentLow <= bb.lower[i] * 1.005; // Within 0.5% of lower BB
    const touchedUpperBB = currentHigh >= bb.upper[i] * 0.995; // Within 0.5% of upper BB

    // Candle closes back inside bands (reversal confirmation)
    const closedInsideBands = currentClose > bb.lower[i] && currentClose < bb.upper[i];

    // RSI turning (momentum shift)
    const rsiTurningUp = currentRSI > prevRSI && currentRSI < 50;
    const rsiTurningDown = currentRSI < prevRSI && currentRSI > 50;

    // ============== BULLISH MEAN REVERSION ==============
    // Price above VWAP (bullish bias) + touched lower BB + RSI oversold turning up
    const bullishReversion = (
      (aboveVWAP || currentClose > currentVWAP * 0.995) && // Near or above VWAP
      touchedLowerBB &&
      closedInsideBands &&
      currentRSI < this.rsiOversold + 15 && // RSI < 45
      rsiTurningUp
    );

    // ============== BEARISH MEAN REVERSION ==============
    // Price below VWAP (bearish bias) + touched upper BB + RSI overbought turning down
    const bearishReversion = (
      (belowVWAP || currentClose < currentVWAP * 1.005) && // Near or below VWAP
      touchedUpperBB &&
      closedInsideBands &&
      currentRSI > this.rsiOverbought - 15 && // RSI > 55
      rsiTurningDown
    );

    if (bullishReversion) {
      return "buy";
    }

    if (bearishReversion) {
      return "sell";
    }

    return "hold";
  }
}

export default new VWAPBBReversionStrategy();
