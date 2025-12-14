// MACD Divergence Strategy
// Detects bullish/bearish divergences between price and MACD histogram

import { BaseStrategy, type Signal } from "../_base/strategy-interface.js";
import type { Candle } from "../../indicators/index.js";
import * as indicators from "../../indicators/index.js";

class MACDDivergenceStrategy extends BaseStrategy {
  id = "momentum/macd-divergence-v1";
  name = "MACD Divergence";
  description = "Detects momentum divergences between price highs/lows and MACD histogram for reversal entries";
  category = "momentum" as const;

  private fastPeriod = 12;
  private slowPeriod = 26;
  private signalPeriod = 9;
  private lookbackPeriod = 10; // Bars to look back for divergence

  getMetadata() {
    return {
      minDataPoints: 50,
      preferredIntervals: [15, 60, 240],
      suitableMarketConditions: ["volatile", "trending-weak"],
      complexity: "moderate" as const,
      author: "claude-example",
      version: "1.0.0",
      createdAt: new Date().toISOString(),
    };
  }

  async analyze(candles: Candle[]): Promise<Signal> {
    if (candles.length < this.slowPeriod + this.signalPeriod + this.lookbackPeriod) {
      return "hold";
    }

    // Calculate MACD
    const closes = candles.map(c => c.close);
    const macdResult = indicators.MACD(closes, this.fastPeriod, this.slowPeriod, this.signalPeriod);

    if (macdResult.histogram.length < this.lookbackPeriod) {
      return "hold";
    }

    const histogram = macdResult.histogram;
    const recentHistogram = histogram.slice(-this.lookbackPeriod);
    const recentCandles = candles.slice(-this.lookbackPeriod);

    // Find local extremes in histogram and price
    const histogramHigh = Math.max(...recentHistogram);
    const histogramLow = Math.min(...recentHistogram);
    const priceHigh = Math.max(...recentCandles.map(c => c.high));
    const priceLow = Math.min(...recentCandles.map(c => c.low));

    const currentHistogram = histogram[histogram.length - 1];
    const prevHistogram = histogram[histogram.length - 2];
    const currentPrice = candles[candles.length - 1].close;
    const prevPrice = candles[candles.length - 2].close;

    // Bullish divergence: Price makes lower low, MACD makes higher low
    const isBullishDivergence = (
      currentPrice <= priceLow * 1.01 && // Near recent low
      currentHistogram > histogramLow && // MACD not at low
      currentHistogram > prevHistogram && // MACD turning up
      currentHistogram < 0 // Below zero line
    );

    // Bearish divergence: Price makes higher high, MACD makes lower high
    const isBearishDivergence = (
      currentPrice >= priceHigh * 0.99 && // Near recent high
      currentHistogram < histogramHigh && // MACD not at high
      currentHistogram < prevHistogram && // MACD turning down
      currentHistogram > 0 // Above zero line
    );

    // Confirm with MACD signal line crossover
    const macdLine = macdResult.macd;
    const signalLine = macdResult.signal;
    const currentMacd = macdLine[macdLine.length - 1];
    const prevMacd = macdLine[macdLine.length - 2];
    const currentSignal = signalLine[signalLine.length - 1];
    const prevSignal = signalLine[signalLine.length - 2];

    const bullishCrossover = prevMacd <= prevSignal && currentMacd > currentSignal;
    const bearishCrossover = prevMacd >= prevSignal && currentMacd < currentSignal;

    if (isBullishDivergence && bullishCrossover) {
      return "buy";
    }

    if (isBearishDivergence && bearishCrossover) {
      return "sell";
    }

    return "hold";
  }
}

// Export default instance
export default new MACDDivergenceStrategy();
