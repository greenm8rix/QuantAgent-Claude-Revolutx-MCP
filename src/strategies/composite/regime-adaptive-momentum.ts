// Regime-Adaptive Momentum Strategy V10
// Switches between momentum and mean-reversion based on detected market regime
// Based on 2025 research: momentum works in stable regimes, mean-reversion in volatile
// Uses volatility clustering for regime detection

import { BaseStrategy, type Signal, type StrategyMetadata, type RiskProfile } from "../_base/strategy-interface.js";
import type { Candle } from "../../indicators/index.js";
import * as indicators from "../../indicators/index.js";

class RegimeAdaptiveMomentumStrategy extends BaseStrategy {
  id = "composite/regime-adaptive-momentum-v10";
  name = "Regime Adaptive Momentum";
  description = "Detects market regime (trending/ranging) using volatility clustering and adapts strategy accordingly - momentum in stable, mean-reversion in volatile";
  category = "composite" as const;

  // Regime detection parameters
  private atrPeriod = 14;
  private volatilityLookback = 20;
  private volatilityThresholdMultiplier = 1.3; // High volatility = ATR > 1.3x avg

  // Momentum regime parameters
  private momentumRsiPeriod = 14;
  private momentumRsiThreshold = 55;
  private momentumEmaPeriod = 21;

  // Mean-reversion regime parameters
  private meanRevRsiPeriod = 7;
  private meanRevRsiOversold = 25;
  private meanRevRsiOverbought = 75;
  private bbPeriod = 20;
  private bbStdDev = 2;

  // ADX for trend strength
  private adxPeriod = 14;
  private adxTrendThreshold = 25;

  getMetadata(): StrategyMetadata {
    return {
      minDataPoints: 60,
      preferredIntervals: [60, 240], // 1h and 4h best for regime detection
      suitableMarketConditions: ["trending", "volatile", "ranging"],
      complexity: "complex",
      author: "claude-iteration-v10",
      version: "10.0.0",
      createdAt: new Date().toISOString(),
    };
  }

  getRiskProfile(): RiskProfile {
    return {
      atrMultiplierSL: 1.8,
      atrMultiplierTP: 3.5,
      minSLPercent: 1.5,
      maxSLPercent: 5.0,
      minTPPercent: 3.0,
      maxTPPercent: 12.0,
    };
  }

  private detectRegime(candles: Candle[]): "trending" | "volatile" | "ranging" {
    const i = candles.length - 1;
    const closes = candles.map(c => c.close);

    // Calculate ATR for volatility
    const atr = indicators.ATR(candles, this.atrPeriod);
    const currentATR = atr[i];

    // Calculate average ATR over lookback period
    const atrSlice = atr.slice(i - this.volatilityLookback, i);
    const avgATR = atrSlice.reduce((a, b) => a + b, 0) / atrSlice.length;

    // Calculate ADX for trend strength
    const { adx, plusDI, minusDI } = indicators.ADX(candles, this.adxPeriod);
    const currentADX = adx[i];

    // High volatility regime
    const isHighVolatility = currentATR > avgATR * this.volatilityThresholdMultiplier;

    // Strong trend regime
    const isStrongTrend = currentADX > this.adxTrendThreshold;

    if (isStrongTrend && !isHighVolatility) {
      return "trending";
    } else if (isHighVolatility) {
      return "volatile";
    } else {
      return "ranging";
    }
  }

  private momentumSignal(candles: Candle[]): Signal {
    const i = candles.length - 1;
    const closes = candles.map(c => c.close);

    // RSI for momentum direction
    const rsi = indicators.RSI_Simple(closes, this.momentumRsiPeriod);
    const currentRSI = rsi[i];
    const prevRSI = rsi[i - 1];

    // EMA for trend
    const ema = indicators.EMA(closes, this.momentumEmaPeriod);
    const currentClose = closes[i];
    const aboveEma = currentClose > ema[i];

    // ADX direction
    const { plusDI, minusDI } = indicators.ADX(candles, this.adxPeriod);
    const bullishDI = plusDI[i] > minusDI[i];

    // Momentum buy: RSI rising, above EMA, bullish DI
    if (currentRSI > this.momentumRsiThreshold && prevRSI < currentRSI && aboveEma && bullishDI) {
      return "buy";
    }

    // Momentum sell: RSI falling, below EMA, bearish DI
    if (currentRSI < (100 - this.momentumRsiThreshold) && prevRSI > currentRSI && !aboveEma && !bullishDI) {
      return "sell";
    }

    return "hold";
  }

  private meanReversionSignal(candles: Candle[]): Signal {
    const i = candles.length - 1;
    const closes = candles.map(c => c.close);

    // RSI for extremes
    const rsi = indicators.RSI_Simple(closes, this.meanRevRsiPeriod);
    const currentRSI = rsi[i];
    const prevRSI = rsi[i - 1];

    // Bollinger Bands
    const bb = indicators.BollingerBands(closes, this.bbPeriod, this.bbStdDev);
    const currentClose = closes[i];
    const currentLow = candles[i].low;
    const currentHigh = candles[i].high;

    // Mean reversion buy: Oversold RSI turning up + near/below lower BB
    if (currentRSI < this.meanRevRsiOversold && currentRSI > prevRSI && currentLow <= bb.lower[i] * 1.01) {
      return "buy";
    }

    // Mean reversion sell: Overbought RSI turning down + near/above upper BB
    if (currentRSI > this.meanRevRsiOverbought && currentRSI < prevRSI && currentHigh >= bb.upper[i] * 0.99) {
      return "sell";
    }

    return "hold";
  }

  async analyze(candles: Candle[]): Promise<Signal> {
    if (candles.length < this.volatilityLookback + this.atrPeriod + 10) {
      return "hold";
    }

    // Detect current market regime
    const regime = this.detectRegime(candles);

    // Apply strategy based on regime
    if (regime === "trending") {
      // Use momentum strategy in trending markets
      return this.momentumSignal(candles);
    } else if (regime === "volatile" || regime === "ranging") {
      // Use mean-reversion in volatile/ranging markets
      return this.meanReversionSignal(candles);
    }

    return "hold";
  }
}

export default new RegimeAdaptiveMomentumStrategy();
