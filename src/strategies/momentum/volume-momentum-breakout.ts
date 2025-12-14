// Volume Momentum Breakout Strategy
// Based on 2025 research: Volume-price divergence identifies 60% of trend reversals
// High volume breakouts with momentum confirmation have higher success rates
// Reference: mindmathmoney.com, quantifiedstrategies.com volume analysis

import { BaseStrategy, type Signal, type StrategyMetadata, type RiskProfile } from "../_base/strategy-interface.js";
import type { Candle } from "../../indicators/index.js";
import * as indicators from "../../indicators/index.js";

class VolumeMomentumBreakoutStrategy extends BaseStrategy {
  id = "momentum/volume-momentum-breakout-v1";
  name = "Volume Momentum Breakout";
  description = "Captures breakouts confirmed by volume spikes and momentum indicators (OBV, CMF, RSI)";
  category = "momentum" as const;

  // Volume parameters
  private volumePeriod = 20;
  private volumeSpike = 1.8; // Volume must be 1.8x average for breakout
  private volumeMinimum = 1.2; // Minimum volume for any entry

  // Momentum parameters
  private rsiPeriod = 14;
  private rsiBullish = 55;
  private rsiBearish = 45;

  // Breakout detection
  private lookbackPeriod = 20; // Donchian channel lookback

  // CMF (Chaikin Money Flow) for buy/sell pressure
  private cmfPeriod = 20;

  getMetadata(): StrategyMetadata {
    return {
      minDataPoints: 50,
      preferredIntervals: [15, 60], // Works on shorter timeframes
      suitableMarketConditions: ["volatile", "trending"],
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
      minSLPercent: 1.5,
      maxSLPercent: 5.0,
      minTPPercent: 2.5,
      maxTPPercent: 10.0,
    };
  }

  async analyze(candles: Candle[]): Promise<Signal> {
    if (candles.length < this.lookbackPeriod + 10) {
      return "hold";
    }

    const closes = candles.map(c => c.close);
    const volumes = candles.map(c => c.volume);
    const i = candles.length - 1;

    // Calculate indicators
    const volumeSMA = indicators.SMA(volumes, this.volumePeriod);
    const rsi = indicators.RSI_Simple(closes, this.rsiPeriod);
    const cmf = indicators.CMF(candles, this.cmfPeriod);
    const obv = indicators.OBV(candles);
    const donchian = indicators.DonchianChannel(candles, this.lookbackPeriod);

    // Get current values
    const currentPrice = closes[i];
    const currentHigh = candles[i].high;
    const currentLow = candles[i].low;
    const currentVolume = volumes[i];
    const avgVolume = volumeSMA[i];
    const currentRSI = rsi[i];
    const currentCMF = cmf[i];
    const currentOBV = obv[i];
    const prevOBV = obv[i - 1];

    // Skip if indicators not ready
    if (isNaN(avgVolume) || isNaN(currentRSI) || isNaN(currentCMF) || isNaN(donchian.upper[i])) {
      return "hold";
    }

    // Volume analysis
    const volumeRatio = currentVolume / avgVolume;
    const isVolumeSpike = volumeRatio > this.volumeSpike;
    const hasMinVolume = volumeRatio > this.volumeMinimum;

    // OBV trend (accumulation vs distribution)
    const obvTrend = currentOBV - prevOBV;
    const obvBullish = obvTrend > 0;
    const obvBearish = obvTrend < 0;

    // CMF (money flow)
    const cmfBullish = currentCMF > 0.05; // Strong buying pressure
    const cmfBearish = currentCMF < -0.05; // Strong selling pressure

    // RSI momentum
    const rsiBullish = currentRSI > this.rsiBullish;
    const rsiBearish = currentRSI < this.rsiBearish;

    // Donchian channel breakout detection
    // Use previous bar's channel to avoid look-ahead bias
    const prevDonchianHigh = donchian.upper[i - 1];
    const prevDonchianLow = donchian.lower[i - 1];
    const bullishBreakout = currentHigh > prevDonchianHigh;
    const bearishBreakout = currentLow < prevDonchianLow;

    // Count momentum confirmations
    let bullishMomentum = 0;
    if (obvBullish) bullishMomentum++;
    if (cmfBullish) bullishMomentum++;
    if (rsiBullish) bullishMomentum++;

    let bearishMomentum = 0;
    if (obvBearish) bearishMomentum++;
    if (cmfBearish) bearishMomentum++;
    if (rsiBearish) bearishMomentum++;

    // === BREAKOUT WITH VOLUME SPIKE ===
    // High-probability setup: Breakout + volume spike + momentum confirmation
    if (bullishBreakout && isVolumeSpike && bullishMomentum >= 2) {
      return "buy";
    }

    if (bearishBreakout && isVolumeSpike && bearishMomentum >= 2) {
      return "sell";
    }

    // === MOMENTUM DIVERGENCE ===
    // Volume leading price - OBV divergence
    // If OBV is trending strongly while price consolidates, expect breakout
    const priceNearMiddle = Math.abs(currentPrice - donchian.middle[i]) / (donchian.upper[i] - donchian.lower[i]) < 0.3;

    if (priceNearMiddle && hasMinVolume) {
      // Strong OBV + CMF + RSI alignment without breakout yet
      if (bullishMomentum >= 3 && currentPrice > donchian.middle[i]) {
        return "buy";
      }
      if (bearishMomentum >= 3 && currentPrice < donchian.middle[i]) {
        return "sell";
      }
    }

    // === VOLUME CLIMAX WITH REVERSAL ===
    // Extreme volume at support/resistance can signal reversal
    if (isVolumeSpike && volumeRatio > 2.5) {
      // Near channel boundaries with extreme volume
      const nearLower = currentLow <= prevDonchianLow * 1.01;
      const nearUpper = currentHigh >= prevDonchianHigh * 0.99;

      // Climax at support with bullish internals
      if (nearLower && cmfBullish && obvBullish) {
        return "buy";
      }

      // Climax at resistance with bearish internals
      if (nearUpper && cmfBearish && obvBearish) {
        return "sell";
      }
    }

    return "hold";
  }
}

export default new VolumeMomentumBreakoutStrategy();
