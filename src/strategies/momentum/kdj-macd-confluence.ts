// KDJ + MACD Confluence Strategy
// Based on 2025 Gate.io research: KDJ for crypto is highly effective with MACD confirmation
// KDJ is a stochastic oscillator variant popular in Asian markets

import { BaseStrategy, type Signal, type StrategyMetadata, type RiskProfile } from "../_base/strategy-interface.js";
import type { Candle } from "../../indicators/index.js";
import * as indicators from "../../indicators/index.js";

class KDJMACDConfluenceStrategy extends BaseStrategy {
  id = "momentum/kdj-macd-confluence-v1";
  name = "KDJ MACD Confluence";
  description = "KDJ stochastic oscillator with MACD momentum confirmation for high-probability entries";
  category = "momentum" as const;

  // KDJ parameters (optimized for crypto)
  private kdjPeriod = 9;
  private kSmoothing = 3;
  private dSmoothing = 3;
  private kdjOversold = 20;
  private kdjOverbought = 80;
  
  // MACD parameters
  private macdFast = 12;
  private macdSlow = 26;
  private macdSignal = 9;

  getMetadata(): StrategyMetadata {
    return {
      minDataPoints: 50,
      preferredIntervals: [15, 60, 240],
      suitableMarketConditions: ["trending", "volatile"],
      complexity: "moderate",
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

  // Calculate KDJ indicator
  private calculateKDJ(candles: Candle[]): { k: number[], d: number[], j: number[] } {
    const k: number[] = [];
    const d: number[] = [];
    const j: number[] = [];

    for (let i = 0; i < candles.length; i++) {
      if (i < this.kdjPeriod - 1) {
        k.push(NaN);
        d.push(NaN);
        j.push(NaN);
        continue;
      }

      // Calculate RSV (Raw Stochastic Value)
      const slice = candles.slice(i - this.kdjPeriod + 1, i + 1);
      const highestHigh = Math.max(...slice.map(c => c.high));
      const lowestLow = Math.min(...slice.map(c => c.low));
      const range = highestHigh - lowestLow;
      const rsv = range === 0 ? 50 : ((candles[i].close - lowestLow) / range) * 100;

      // Smoothed K (using EMA-like smoothing)
      if (i === this.kdjPeriod - 1) {
        k.push(rsv);
        d.push(rsv);
      } else {
        // K = 2/3 * previous K + 1/3 * RSV
        const prevK = k[i - 1];
        const newK = (2 / this.kSmoothing) * prevK + (1 / this.kSmoothing) * rsv;
        k.push(newK);
        
        // D = 2/3 * previous D + 1/3 * K
        const prevD = d[i - 1];
        const newD = (2 / this.dSmoothing) * prevD + (1 / this.dSmoothing) * newK;
        d.push(newD);
      }

      // J = 3K - 2D (more sensitive, can go above 100 or below 0)
      j.push(3 * k[i] - 2 * d[i]);
    }

    return { k, d, j };
  }

  async analyze(candles: Candle[]): Promise<Signal> {
    if (candles.length < 50) return "hold";

    const closes = candles.map(c => c.close);
    const i = candles.length - 1;

    // Calculate KDJ
    const kdj = this.calculateKDJ(candles);
    
    // Calculate MACD
    const macd = indicators.MACD(closes, this.macdFast, this.macdSlow, this.macdSignal);

    // Current values
    const currentK = kdj.k[i];
    const currentD = kdj.d[i];
    const currentJ = kdj.j[i];
    const prevK = kdj.k[i - 1];
    const prevD = kdj.d[i - 1];
    const prevJ = kdj.j[i - 1];
    
    const currentMACDHist = macd.histogram[i];
    const prevMACDHist = macd.histogram[i - 1];

    // Skip if indicators not ready
    if (isNaN(currentK) || isNaN(currentD) || isNaN(currentMACDHist)) {
      return "hold";
    }

    // KDJ crossover detection
    const kCrossesAboveD = prevK <= prevD && currentK > currentD;  // Bullish golden cross
    const kCrossesBelowD = prevK >= prevD && currentK < currentD;  // Bearish death cross

    // KDJ zone detection
    const inOversoldZone = currentK < this.kdjOversold || currentD < this.kdjOversold;
    const inOverboughtZone = currentK > this.kdjOverbought || currentD > this.kdjOverbought;

    // J line is the most sensitive - use it for early signals
    const jRising = currentJ > prevJ;
    const jFalling = currentJ < prevJ;

    // MACD confirmation
    const macdRising = currentMACDHist > prevMACDHist;
    const macdFalling = currentMACDHist < prevMACDHist;
    const macdPositive = currentMACDHist > 0;
    const macdNegative = currentMACDHist < 0;

    // ============== BULLISH SIGNAL ==============
    // KDJ golden cross in oversold zone + J rising + MACD supportive
    const bullishSignal = (
      kCrossesAboveD &&
      (inOversoldZone || currentK < 50) &&
      jRising &&
      (macdRising || macdPositive)
    );

    // Alternative bullish: J line turning up from extreme + MACD histogram rising
    const altBullish = (
      currentJ < 10 && prevJ < currentJ &&
      macdRising &&
      currentK > prevK
    );

    // ============== BEARISH SIGNAL ==============
    // KDJ death cross in overbought zone + J falling + MACD weakening
    const bearishSignal = (
      kCrossesBelowD &&
      (inOverboughtZone || currentK > 50) &&
      jFalling &&
      (macdFalling || macdNegative)
    );

    // Alternative bearish: J line turning down from extreme + MACD histogram falling
    const altBearish = (
      currentJ > 90 && prevJ > currentJ &&
      macdFalling &&
      currentK < prevK
    );

    if (bullishSignal || altBullish) {
      return "buy";
    }

    if (bearishSignal || altBearish) {
      return "sell";
    }

    return "hold";
  }
}

export default new KDJMACDConfluenceStrategy();
