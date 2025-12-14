// Multi-Indicator Confluence Strategy
// Combines multiple momentum indicators for high-probability signals
// Only trades when RSI, MACD, and ADX all align
// Target: High win rate through strict confluence requirements

import { BaseStrategy, type Signal, type StrategyMetadata, type RiskProfile } from "../_base/strategy-interface.js";
import type { Candle } from "../../indicators/index.js";
import * as indicators from "../../indicators/index.js";

class MultiIndicatorConfluenceStrategy extends BaseStrategy {
  id = "composite/multi-indicator-confluence-v1";
  name = "Multi-Indicator Confluence";
  description = "High-confidence entries requiring alignment of RSI, MACD, and ADX trend indicators";
  category = "composite" as const;

  // Indicator parameters
  private rsiPeriod = 14;
  private macdFast = 12;
  private macdSlow = 26;
  private macdSignal = 9;
  private adxPeriod = 14;
  private adxTrendThreshold = 20; // ADX above 20 indicates trending market

  getMetadata(): StrategyMetadata {
    return {
      minDataPoints: 60,
      preferredIntervals: [60, 240],
      suitableMarketConditions: ["trending"],
      complexity: "complex",
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
      maxSLPercent: 6.0,
      minTPPercent: 3.0,
      maxTPPercent: 15.0,
    };
  }

  async analyze(candles: Candle[]): Promise<Signal> {
    if (candles.length < this.macdSlow + this.macdSignal + 5) {
      return "hold";
    }

    const closes = candles.map(c => c.close);
    const i = candles.length - 1;

    // Calculate all indicators
    const rsi = indicators.RSI_Simple(closes, this.rsiPeriod);
    const macd = indicators.MACD(closes, this.macdFast, this.macdSlow, this.macdSignal);
    const adx = indicators.ADX(candles, this.adxPeriod);

    // Get current values
    const currentRSI = rsi[i];
    const prevRSI = rsi[i - 1];
    const currentMACD = macd.macd[i];
    const currentSignal = macd.signal[i];
    const prevMACD = macd.macd[i - 1];
    const prevSignal = macd.signal[i - 1];
    const currentADX = adx.adx[i];
    const plusDI = adx.plusDI[i];
    const minusDI = adx.minusDI[i];

    // Skip if any indicator not ready
    if (isNaN(currentRSI) || isNaN(currentMACD) || isNaN(currentSignal) || isNaN(currentADX)) {
      return "hold";
    }

    // Check for trending market (ADX > threshold)
    const isTrending = currentADX > this.adxTrendThreshold;

    // MACD crossover detection
    const bullishMACDCross = prevMACD <= prevSignal && currentMACD > currentSignal;
    const bearishMACDCross = prevMACD >= prevSignal && currentMACD < currentSignal;

    // RSI conditions
    const rsiBullish = currentRSI > 40 && currentRSI < 70 && currentRSI > prevRSI;
    const rsiBearish = currentRSI < 60 && currentRSI > 30 && currentRSI < prevRSI;

    // DI direction
    const bullishDI = plusDI > minusDI;
    const bearishDI = minusDI > plusDI;

    // BUY: All indicators align bullish
    // - Market is trending (ADX > 20)
    // - MACD bullish crossover
    // - RSI in bullish zone and rising
    // - +DI > -DI (bullish trend direction)
    if (isTrending && bullishMACDCross && rsiBullish && bullishDI) {
      return "buy";
    }

    // SELL: All indicators align bearish
    // - Market is trending (ADX > 20)
    // - MACD bearish crossover
    // - RSI in bearish zone and falling
    // - -DI > +DI (bearish trend direction)
    if (isTrending && bearishMACDCross && rsiBearish && bearishDI) {
      return "sell";
    }

    return "hold";
  }
}

export default new MultiIndicatorConfluenceStrategy();
