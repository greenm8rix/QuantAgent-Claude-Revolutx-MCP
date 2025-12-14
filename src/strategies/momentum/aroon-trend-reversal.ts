// Aroon Trend Reversal Strategy
// Uses Aroon Indicator to detect trend changes and reversals
// Aroon Up/Down measure time since highest high and lowest low
// Aroon crossovers signal trend changes, extreme readings confirm trends
// Source: StockCharts, TradingView Aroon analysis

import { BaseStrategy, type Signal, type StrategyMetadata, type RiskProfile } from "../_base/strategy-interface.js";
import type { Candle } from "../../indicators/index.js";
import * as indicators from "../../indicators/index.js";

class AroonTrendReversalStrategy extends BaseStrategy {
  id = "momentum/aroon-trend-reversal-v1";
  name = "Aroon Trend Reversal";
  description = "Detects trend reversals using Aroon Up/Down crossovers with oscillator confirmation";
  category = "momentum" as const;

  // Aroon parameters
  private aroonPeriod = 14;

  // Signal thresholds
  private strongTrendLevel = 70;
  private weakTrendLevel = 30;

  // RSI filter
  private rsiPeriod = 14;

  getMetadata(): StrategyMetadata {
    return {
      minDataPoints: 30,
      preferredIntervals: [60, 240, 1440], // 1h, 4h, 1d
      suitableMarketConditions: ["trending", "volatile"],
      complexity: "simple",
      author: "claude-iteration-1-v10",
      version: "1.0.0",
      createdAt: new Date().toISOString(),
    };
  }

  getRiskProfile(): RiskProfile {
    return {
      atrMultiplierSL: 2.0,
      atrMultiplierTP: 3.5,
      minSLPercent: 2.0,
      maxSLPercent: 6.0,
      minTPPercent: 4.0,
      maxTPPercent: 12.0,
    };
  }

  async analyze(candles: Candle[]): Promise<Signal> {
    if (candles.length < this.aroonPeriod + 10) {
      return "hold";
    }

    const closes = candles.map(c => c.close);

    // Calculate Aroon indicator
    const aroon = indicators.AroonIndicator(candles, this.aroonPeriod);

    // Calculate RSI for additional confirmation
    const rsi = indicators.RSI_Simple(closes, this.rsiPeriod);

    // Calculate EMA for trend bias
    const ema20 = indicators.EMA(closes, 20);

    const i = candles.length - 1;
    const currentAroonUp = aroon.aroonUp[i];
    const prevAroonUp = aroon.aroonUp[i - 1];
    const currentAroonDown = aroon.aroonDown[i];
    const prevAroonDown = aroon.aroonDown[i - 1];
    const currentOscillator = aroon.oscillator[i];
    const prevOscillator = aroon.oscillator[i - 1];
    const currentRSI = rsi[i];
    const currentEMA = ema20[i];
    const currentClose = closes[i];

    // Skip if not ready
    if (isNaN(currentAroonUp) || isNaN(currentRSI) || isNaN(currentEMA)) {
      return "hold";
    }

    // Aroon crossover signals
    const bullishCrossover = prevAroonUp <= prevAroonDown && currentAroonUp > currentAroonDown;
    const bearishCrossover = prevAroonUp >= prevAroonDown && currentAroonUp < currentAroonDown;

    // Strong trend readings
    const strongUptrend = currentAroonUp > this.strongTrendLevel && currentAroonDown < this.weakTrendLevel;
    const strongDowntrend = currentAroonDown > this.strongTrendLevel && currentAroonUp < this.weakTrendLevel;

    // Oscillator momentum
    const oscillatorRising = currentOscillator > prevOscillator;
    const oscillatorFalling = currentOscillator < prevOscillator;
    const oscillatorExtremeBullish = currentOscillator > 50;
    const oscillatorExtremeBearish = currentOscillator < -50;

    // EMA trend confirmation
    const aboveEMA = currentClose > currentEMA;
    const belowEMA = currentClose < currentEMA;

    // RSI momentum
    const rsiBullish = currentRSI > 50;
    const rsiBearish = currentRSI < 50;
    const rsiNotExtreme = currentRSI > 30 && currentRSI < 70;

    // BUY signals
    if (bullishCrossover) {
      // Fresh bullish crossover
      if (oscillatorRising || rsiBullish) {
        return "buy";
      }
    }

    if (strongUptrend && aboveEMA && oscillatorExtremeBullish) {
      // Strong uptrend continuation
      if (rsiBullish && rsiNotExtreme) {
        return "buy";
      }
    }

    // SELL signals
    if (bearishCrossover) {
      // Fresh bearish crossover
      if (oscillatorFalling || rsiBearish) {
        return "sell";
      }
    }

    if (strongDowntrend && belowEMA && oscillatorExtremeBearish) {
      // Strong downtrend continuation
      if (rsiBearish && rsiNotExtreme) {
        return "sell";
      }
    }

    return "hold";
  }
}

export default new AroonTrendReversalStrategy();
