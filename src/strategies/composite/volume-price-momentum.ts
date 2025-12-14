// Volume Price Momentum Strategy
// Combines volume analysis with price momentum for confirmation
// Uses OBV divergence, volume spikes, and CMF for directional bias
// Based on order flow principles - trade when volume confirms price move
// Source: QuantifiedStrategies, Webopedia Order Flow Analysis

import { BaseStrategy, type Signal, type StrategyMetadata, type RiskProfile } from "../_base/strategy-interface.js";
import type { Candle } from "../../indicators/index.js";
import * as indicators from "../../indicators/index.js";

class VolumePriceMomentumStrategy extends BaseStrategy {
  id = "composite/volume-price-momentum-v1";
  name = "Volume Price Momentum";
  description = "Multi-indicator strategy using volume confirmation with price momentum";
  category = "composite" as const;

  // Parameters
  private rsiPeriod = 14;
  private cmfPeriod = 20;
  private obvSmaPeriod = 20;
  private volumeSpikeMult = 1.5;

  getMetadata(): StrategyMetadata {
    return {
      minDataPoints: 50,
      preferredIntervals: [15, 60, 240],
      suitableMarketConditions: ["volatile", "trending"],
      complexity: "moderate",
      author: "claude-iteration-1-v10",
      version: "1.0.0",
      createdAt: new Date().toISOString(),
    };
  }

  getRiskProfile(): RiskProfile {
    return {
      atrMultiplierSL: 1.5,
      atrMultiplierTP: 3.0,
      minSLPercent: 1.5,
      maxSLPercent: 5.0,
      minTPPercent: 3.0,
      maxTPPercent: 10.0,
    };
  }

  async analyze(candles: Candle[]): Promise<Signal> {
    if (candles.length < this.obvSmaPeriod + 10) {
      return "hold";
    }

    const closes = candles.map(c => c.close);
    const volumes = candles.map(c => c.volume);

    // Calculate indicators
    const rsi = indicators.RSI_Simple(closes, this.rsiPeriod);
    const cmf = indicators.CMF(candles, this.cmfPeriod);
    const obv = indicators.OBV(candles);
    const obvSMA = indicators.SMA(obv, this.obvSmaPeriod);
    const volumeSMA = indicators.SMA(volumes, 20);
    const ema20 = indicators.EMA(closes, 20);
    const ema50 = indicators.EMA(closes, 50);

    const i = candles.length - 1;
    const currentRSI = rsi[i];
    const currentCMF = cmf[i];
    const currentOBV = obv[i];
    const prevOBV = obv[i - 1];
    const currentOBVSMA = obvSMA[i];
    const currentVolume = volumes[i];
    const avgVolume = volumeSMA[i];
    const currentClose = closes[i];
    const prevClose = closes[i - 1];
    const currentEMA20 = ema20[i];
    const currentEMA50 = ema50[i];

    // Skip if not ready
    if (isNaN(currentRSI) || isNaN(currentCMF) || isNaN(currentOBVSMA)) {
      return "hold";
    }

    // Volume spike detection
    const hasVolumeSpike = currentVolume > avgVolume * this.volumeSpikeMult;

    // Price momentum
    const isBullishCandle = candles[i].close > candles[i].open;
    const isBearishCandle = candles[i].close < candles[i].open;
    const priceUp = currentClose > prevClose;
    const priceDown = currentClose < prevClose;

    // OBV trend
    const obvRising = currentOBV > currentOBVSMA && currentOBV > prevOBV;
    const obvFalling = currentOBV < currentOBVSMA && currentOBV < prevOBV;

    // OBV divergence detection
    const lookback = 5;
    let priceMakingHigherHighs = true;
    let priceMakingLowerLows = true;
    let obvMakingHigherHighs = true;
    let obvMakingLowerLows = true;

    for (let j = i - lookback; j < i; j++) {
      if (closes[j + 1] <= closes[j]) priceMakingHigherHighs = false;
      if (closes[j + 1] >= closes[j]) priceMakingLowerLows = false;
      if (obv[j + 1] <= obv[j]) obvMakingHigherHighs = false;
      if (obv[j + 1] >= obv[j]) obvMakingLowerLows = false;
    }

    // Bullish OBV divergence: price lower, OBV higher
    const bullishOBVDivergence = priceMakingLowerLows && !obvMakingLowerLows;
    // Bearish OBV divergence: price higher, OBV lower
    const bearishOBVDivergence = priceMakingHigherHighs && !obvMakingHigherHighs;

    // CMF signals (positive = buying pressure, negative = selling pressure)
    const cmfBullish = currentCMF > 0.1;
    const cmfBearish = currentCMF < -0.1;

    // EMA trend
    const bullishTrend = currentClose > currentEMA20 && currentEMA20 > currentEMA50;
    const bearishTrend = currentClose < currentEMA20 && currentEMA20 < currentEMA50;

    // RSI momentum
    const rsiBullish = currentRSI > 50 && currentRSI < 70;
    const rsiBearish = currentRSI < 50 && currentRSI > 30;
    const rsiOversold = currentRSI < 35;
    const rsiOverbought = currentRSI > 65;

    // Scoring system for confluence
    let bullScore = 0;
    let bearScore = 0;

    // Volume and OBV signals
    if (hasVolumeSpike && isBullishCandle) bullScore += 2;
    if (hasVolumeSpike && isBearishCandle) bearScore += 2;
    if (obvRising) bullScore += 1;
    if (obvFalling) bearScore += 1;
    if (bullishOBVDivergence) bullScore += 2;
    if (bearishOBVDivergence) bearScore += 2;

    // CMF signals
    if (cmfBullish) bullScore += 1;
    if (cmfBearish) bearScore += 1;

    // Trend alignment
    if (bullishTrend) bullScore += 1;
    if (bearishTrend) bearScore += 1;

    // RSI signals
    if (rsiBullish || rsiOversold) bullScore += 1;
    if (rsiBearish || rsiOverbought) bearScore += 1;

    // Generate signals based on confluence (need 3+ confirming factors)
    if (bullScore >= 3 && bearScore < 2) {
      return "buy";
    }

    if (bearScore >= 3 && bullScore < 2) {
      return "sell";
    }

    return "hold";
  }
}

export default new VolumePriceMomentumStrategy();
