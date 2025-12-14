// EMA Crossover Momentum Strategy
// Simple but effective EMA 9/21 crossover with RSI filter
// Designed to generate more signals for active trading

import { BaseStrategy, type Signal, type StrategyMetadata, type RiskProfile } from "../_base/strategy-interface.js";
import type { Candle } from "../../indicators/index.js";
import * as indicators from "../../indicators/index.js";

class EMACrossoverMomentumStrategy extends BaseStrategy {
  id = "momentum/ema-crossover-momentum-v1";
  name = "EMA Crossover Momentum";
  description = "Classic EMA 9/21 crossover with RSI momentum filter for trend following";
  category = "momentum" as const;

  private fastEMA = 9;
  private slowEMA = 21;
  private rsiPeriod = 14;

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
      atrMultiplierSL: 1.5,
      atrMultiplierTP: 3.0,
      minSLPercent: 1.0,
      maxSLPercent: 4.0,
      minTPPercent: 2.0,
      maxTPPercent: 8.0,
    };
  }

  async analyze(candles: Candle[]): Promise<Signal> {
    if (candles.length < this.slowEMA + 5) {
      return "hold";
    }

    const closes = candles.map(c => c.close);
    const i = candles.length - 1;

    // Calculate EMAs
    const ema9 = indicators.EMA(closes, this.fastEMA);
    const ema21 = indicators.EMA(closes, this.slowEMA);
    const rsi = indicators.RSI_Simple(closes, this.rsiPeriod);

    // Current and previous values
    const currentEMA9 = ema9[i];
    const currentEMA21 = ema21[i];
    const prevEMA9 = ema9[i - 1];
    const prevEMA21 = ema21[i - 1];
    const currentRSI = rsi[i];

    // Skip if not ready
    if (isNaN(currentEMA9) || isNaN(currentEMA21) || isNaN(currentRSI)) {
      return "hold";
    }

    // Detect crossovers
    const bullishCross = prevEMA9 <= prevEMA21 && currentEMA9 > currentEMA21;
    const bearishCross = prevEMA9 >= prevEMA21 && currentEMA9 < currentEMA21;

    // Trend alignment (already in trend, not just crossover)
    const bullishTrend = currentEMA9 > currentEMA21;
    const bearishTrend = currentEMA9 < currentEMA21;

    // RSI filter
    const rsiBullish = currentRSI > 45 && currentRSI < 75;
    const rsiBearish = currentRSI < 55 && currentRSI > 25;

    // BUY: Bullish crossover or already bullish trend with good RSI
    if (bullishCross && rsiBullish) {
      return "buy";
    }

    // SELL: Bearish crossover or already bearish trend with good RSI
    if (bearishCross && rsiBearish) {
      return "sell";
    }

    return "hold";
  }
}

export default new EMACrossoverMomentumStrategy();
