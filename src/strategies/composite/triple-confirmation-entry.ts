// Triple Confirmation Entry Strategy
// Based on 2025 research: RSI + MACD + Bollinger Bands combined achieve ~77% win rate
// Reference: gate.com/crypto-wiki, quantifiedstrategies.com multi-indicator confluence
// "85% of market trend signals align when MACD, RSI, and Bollinger Bands are combined"

import { BaseStrategy, type Signal, type StrategyMetadata, type RiskProfile } from "../_base/strategy-interface.js";
import type { Candle } from "../../indicators/index.js";
import * as indicators from "../../indicators/index.js";

class TripleConfirmationStrategy extends BaseStrategy {
  id = "composite/triple-confirmation-v1";
  name = "Triple Confirmation Entry";
  description = "High-probability entries using RSI + MACD + Bollinger Bands confluence for 3-way confirmation";
  category = "composite" as const;

  // RSI parameters - more responsive
  private rsiPeriod = 9;
  private rsiBullishThreshold = 45; // RSI > 45 for bullish bias (relaxed)
  private rsiBearishThreshold = 55; // RSI < 55 for bearish bias (relaxed)
  private rsiOversold = 35;
  private rsiOverbought = 65;

  // MACD parameters (faster for crypto)
  private macdFast = 6;
  private macdSlow = 13;
  private macdSignal = 4;

  // Bollinger Bands parameters
  private bbPeriod = 15;
  private bbStdDev = 2;

  getMetadata(): StrategyMetadata {
    return {
      minDataPoints: 50,
      preferredIntervals: [15, 60, 240], // Works across timeframes
      suitableMarketConditions: ["trending", "volatile", "ranging"],
      complexity: "complex",
      author: "claude-iteration-1",
      version: "1.0.0",
      createdAt: new Date().toISOString(),
    };
  }

  getRiskProfile(): RiskProfile {
    return {
      atrMultiplierSL: 1.5,
      atrMultiplierTP: 3.0,
      minSLPercent: 1.5,
      maxSLPercent: 4.0,
      minTPPercent: 3.0,
      maxTPPercent: 10.0,
    };
  }

  async analyze(candles: Candle[]): Promise<Signal> {
    if (candles.length < this.macdSlow + this.macdSignal + 10) {
      return "hold";
    }

    const closes = candles.map(c => c.close);
    const i = candles.length - 1;

    // Calculate all three indicators
    const rsi = indicators.RSI_Simple(closes, this.rsiPeriod);
    const macd = indicators.MACD(closes, this.macdFast, this.macdSlow, this.macdSignal);
    const bb = indicators.BollingerBands(closes, this.bbPeriod, this.bbStdDev);

    // Get current and previous values
    const currentRSI = rsi[i];
    const prevRSI = rsi[i - 1];
    const currentMACD = macd.macd[i];
    const currentSignal = macd.signal[i];
    const prevMACD = macd.macd[i - 1];
    const prevSignal = macd.signal[i - 1];
    const currentHistogram = macd.histogram[i];
    const prevHistogram = macd.histogram[i - 1];
    const currentPrice = closes[i];
    const currentLow = candles[i].low;
    const currentHigh = candles[i].high;

    // Skip if indicators not ready
    if (isNaN(currentRSI) || isNaN(currentMACD) || isNaN(currentSignal) || isNaN(bb.lower[i])) {
      return "hold";
    }

    // === CONFIRMATION 1: RSI ===
    // Bullish: RSI > 50 (momentum bias) OR RSI recovering from oversold
    // Bearish: RSI < 50 OR RSI declining from overbought
    const rsiBullish = currentRSI > this.rsiBullishThreshold || (currentRSI > this.rsiOversold && currentRSI > prevRSI);
    const rsiBearish = currentRSI < this.rsiBearishThreshold || (currentRSI < this.rsiOverbought && currentRSI < prevRSI);
    const rsiOversoldRecovery = prevRSI < this.rsiOversold && currentRSI > this.rsiOversold;
    const rsiOverboughtDecline = prevRSI > this.rsiOverbought && currentRSI < this.rsiOverbought;

    // === CONFIRMATION 2: MACD ===
    // Bullish: MACD crossover OR histogram turning positive/increasing
    // Bearish: MACD crossunder OR histogram turning negative/decreasing
    const macdBullishCross = prevMACD <= prevSignal && currentMACD > currentSignal;
    const macdBearishCross = prevMACD >= prevSignal && currentMACD < currentSignal;
    const macdBullish = currentMACD > currentSignal || (currentHistogram > prevHistogram && currentHistogram > 0);
    const macdBearish = currentMACD < currentSignal || (currentHistogram < prevHistogram && currentHistogram < 0);
    const histogramTurningUp = prevHistogram < 0 && currentHistogram > prevHistogram;
    const histogramTurningDown = prevHistogram > 0 && currentHistogram < prevHistogram;

    // === CONFIRMATION 3: BOLLINGER BANDS ===
    // Bullish: Price bouncing off lower band or breaking above middle
    // Bearish: Price bouncing off upper band or breaking below middle
    const nearLowerBand = currentLow <= bb.lower[i] * 1.01;
    const nearUpperBand = currentHigh >= bb.upper[i] * 0.99;
    const priceAboveMiddle = currentPrice > bb.middle[i];
    const priceBelowMiddle = currentPrice < bb.middle[i];
    const bbBullish = nearLowerBand || (priceAboveMiddle && closes[i - 1] <= bb.middle[i - 1]);
    const bbBearish = nearUpperBand || (priceBelowMiddle && closes[i - 1] >= bb.middle[i - 1]);

    // === TRIPLE CONFIRMATION LOGIC ===

    // Count bullish confirmations
    let bullishCount = 0;
    if (rsiBullish || rsiOversoldRecovery) bullishCount++;
    if (macdBullish || macdBullishCross || histogramTurningUp) bullishCount++;
    if (bbBullish) bullishCount++;

    // Count bearish confirmations
    let bearishCount = 0;
    if (rsiBearish || rsiOverboughtDecline) bearishCount++;
    if (macdBearish || macdBearishCross || histogramTurningDown) bearishCount++;
    if (bbBearish) bearishCount++;

    // High probability entry: All 3 confirmations aligned
    // Strong crossover signals get priority
    if (macdBullishCross && rsiBullish && nearLowerBand) {
      return "buy"; // Perfect bullish setup
    }

    if (macdBearishCross && rsiBearish && nearUpperBand) {
      return "sell"; // Perfect bearish setup
    }

    // Standard triple confirmation
    if (bullishCount >= 3 && bearishCount === 0) {
      return "buy";
    }

    if (bearishCount >= 3 && bullishCount === 0) {
      return "sell";
    }

    // Double confirmation (relaxed for more signals)
    if (bullishCount >= 2 && bearishCount === 0) {
      return "buy";
    }

    if (bearishCount >= 2 && bullishCount === 0) {
      return "sell";
    }

    // RSI extreme + 1 confirmation (high probability reversal)
    if (rsiOversoldRecovery && bullishCount >= 1) {
      return "buy";
    }

    if (rsiOverboughtDecline && bearishCount >= 1) {
      return "sell";
    }

    return "hold";
  }
}

export default new TripleConfirmationStrategy();
