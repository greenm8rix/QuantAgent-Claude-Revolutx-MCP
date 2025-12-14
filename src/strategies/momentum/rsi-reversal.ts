// RSI Reversal Strategy
// Simple mean-reversion using RSI extremes
// More active trading with RSI crossovers at extreme levels

import { BaseStrategy, type Signal, type StrategyMetadata, type RiskProfile } from "../_base/strategy-interface.js";
import type { Candle } from "../../indicators/index.js";
import * as indicators from "../../indicators/index.js";

class RSIReversalStrategy extends BaseStrategy {
  id = "momentum/rsi-reversal-v1";
  name = "RSI Reversal";
  description = "Mean reversion using RSI extremes with momentum confirmation";
  category = "mean_reversion" as const;

  private rsiPeriod = 7; // Faster RSI for more signals
  private oversold = 30;
  private overbought = 70;

  getMetadata(): StrategyMetadata {
    return {
      minDataPoints: 20,
      preferredIntervals: [15, 60],
      suitableMarketConditions: ["ranging", "volatile"],
      complexity: "simple",
      author: "claude-iteration-1",
      version: "1.0.0",
      createdAt: new Date().toISOString(),
    };
  }

  getRiskProfile(): RiskProfile {
    return {
      atrMultiplierSL: 1.2,
      atrMultiplierTP: 2.0,
      minSLPercent: 0.8,
      maxSLPercent: 3.0,
      minTPPercent: 1.5,
      maxTPPercent: 5.0,
    };
  }

  async analyze(candles: Candle[]): Promise<Signal> {
    if (candles.length < this.rsiPeriod + 5) {
      return "hold";
    }

    const closes = candles.map(c => c.close);
    const i = candles.length - 1;

    const rsi = indicators.RSI_Simple(closes, this.rsiPeriod);

    const currentRSI = rsi[i];
    const prevRSI = rsi[i - 1];
    const prev2RSI = rsi[i - 2];

    // Skip if not ready
    if (isNaN(currentRSI) || isNaN(prevRSI)) {
      return "hold";
    }

    // RSI turning from extreme - momentum shift
    const turningUpFromOversold = prevRSI < this.oversold && currentRSI > prevRSI && currentRSI > prev2RSI;
    const turningDownFromOverbought = prevRSI > this.overbought && currentRSI < prevRSI && currentRSI < prev2RSI;

    // Crossing threshold levels
    const crossingAboveOversold = prevRSI <= this.oversold && currentRSI > this.oversold;
    const crossingBelowOverbought = prevRSI >= this.overbought && currentRSI < this.overbought;

    // BUY: RSI bouncing from oversold
    if (turningUpFromOversold || crossingAboveOversold) {
      return "buy";
    }

    // SELL: RSI dropping from overbought
    if (turningDownFromOverbought || crossingBelowOverbought) {
      return "sell";
    }

    return "hold";
  }
}

export default new RSIReversalStrategy();
