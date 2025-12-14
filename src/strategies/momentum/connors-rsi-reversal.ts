// Connors RSI Reversal Strategy
// Uses Connors RSI (composite of RSI, streak RSI, and ROC percentile)
// CRSI is excellent for mean reversion with extreme levels: <10 oversold, >90 overbought
// Source: Connors Research, TradingView Community

import { BaseStrategy, type Signal, type StrategyMetadata, type RiskProfile } from "../_base/strategy-interface.js";
import type { Candle } from "../../indicators/index.js";
import * as indicators from "../../indicators/index.js";

class ConnorsRSIReversalStrategy extends BaseStrategy {
  id = "momentum/connors-rsi-reversal-v1";
  name = "Connors RSI Reversal";
  description = "Mean reversion using composite Connors RSI for high-probability reversal entries";
  category = "momentum" as const;

  // CRSI parameters (standard Connors settings)
  private rsiPeriod = 3;
  private streakPeriod = 2;
  private rocPeriod = 100;

  // Signal thresholds
  private oversoldLevel = 15;
  private overboughtLevel = 85;
  private extremeOversold = 5;
  private extremeOverbought = 95;

  getMetadata(): StrategyMetadata {
    return {
      minDataPoints: 120, // Need 100+ for ROC percentile
      preferredIntervals: [15, 60, 240],
      suitableMarketConditions: ["ranging", "volatile"],
      complexity: "moderate",
      author: "claude-iteration-1-v10",
      version: "1.0.0",
      createdAt: new Date().toISOString(),
    };
  }

  getRiskProfile(): RiskProfile {
    return {
      atrMultiplierSL: 1.5,
      atrMultiplierTP: 2.0,
      minSLPercent: 1.0,
      maxSLPercent: 3.0,
      minTPPercent: 1.5,
      maxTPPercent: 5.0,
    };
  }

  async analyze(candles: Candle[]): Promise<Signal> {
    if (candles.length < this.rocPeriod + 10) {
      return "hold";
    }

    const closes = candles.map(c => c.close);

    // Calculate Connors RSI
    const crsi = indicators.ConnorsRSI(closes, this.rsiPeriod, this.streakPeriod, this.rocPeriod);

    // Also get standard RSI for confirmation
    const rsi14 = indicators.RSI_Simple(closes, 14);

    // Get ATR for volatility context
    const atr = indicators.ATR(candles, 14);

    const i = candles.length - 1;
    const currentCRSI = crsi[i];
    const prevCRSI = crsi[i - 1];
    const prev2CRSI = crsi[i - 2];
    const currentRSI14 = rsi14[i];
    const currentATR = atr[i];
    const currentClose = closes[i];
    const prevClose = closes[i - 1];

    // Skip if not ready
    if (isNaN(currentCRSI) || isNaN(prevCRSI) || isNaN(currentRSI14)) {
      return "hold";
    }

    // Normalize ATR to detect volatility regime
    const atrPercent = (currentATR / currentClose) * 100;
    const isHighVolatility = atrPercent > 3; // More than 3% ATR

    // Dynamic thresholds based on volatility
    const buyThreshold = isHighVolatility ? this.extremeOversold : this.oversoldLevel;
    const sellThreshold = isHighVolatility ? this.extremeOverbought : this.overboughtLevel;

    // CRSI turning signals
    const crsiTurningUp = currentCRSI > prevCRSI && prevCRSI <= prev2CRSI;
    const crsiTurningDown = currentCRSI < prevCRSI && prevCRSI >= prev2CRSI;

    // Price confirmation - bullish/bearish candle
    const isBullishCandle = candles[i].close > candles[i].open;
    const isBearishCandle = candles[i].close < candles[i].open;

    // RSI14 alignment (not strictly required but adds confidence)
    const rsi14Oversold = currentRSI14 < 40;
    const rsi14Overbought = currentRSI14 > 60;

    // BUY: CRSI oversold and turning up
    if (currentCRSI < buyThreshold) {
      if (crsiTurningUp && isBullishCandle) {
        return "buy";
      }
      // Extreme oversold - can enter on any turn
      if (currentCRSI < this.extremeOversold && currentCRSI > prevCRSI) {
        return "buy";
      }
    }

    // SELL: CRSI overbought and turning down
    if (currentCRSI > sellThreshold) {
      if (crsiTurningDown && isBearishCandle) {
        return "sell";
      }
      // Extreme overbought - can enter on any turn
      if (currentCRSI > this.extremeOverbought && currentCRSI < prevCRSI) {
        return "sell";
      }
    }

    return "hold";
  }
}

export default new ConnorsRSIReversalStrategy();
