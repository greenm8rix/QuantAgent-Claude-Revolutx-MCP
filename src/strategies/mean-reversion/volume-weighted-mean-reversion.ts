// Volume-Weighted Mean Reversion Strategy
// Uses VWAP bands and order flow imbalance to identify mean reversion opportunities
// Trades when price deviates significantly from VWAP with volume confirmation

import { BaseStrategy, type Signal, type StrategyMetadata, type RiskProfile } from "../_base/strategy-interface.js";
import type { Candle } from "../../indicators/index.js";
import * as indicators from "../../indicators/index.js";

class VolumeWeightedMeanReversionStrategy extends BaseStrategy {
  id = "mean-reversion/volume-weighted-mean-reversion-v1";
  name = "Volume Weighted Mean Reversion";
  description = "Mean reversion using VWAP bands with volume delta confirmation for high-probability reversals";
  category = "mean_reversion" as const;

  private lookback = 21; // Rolling VWAP period
  private deviationThreshold = 2.0; // Standard deviations from VWAP

  getMetadata(): StrategyMetadata {
    return {
      minDataPoints: 50,
      preferredIntervals: [15, 60],
      suitableMarketConditions: ["ranging", "volatile"],
      complexity: "moderate",
      author: "claude-iteration-1",
      version: "1.0.0",
      createdAt: new Date().toISOString(),
    };
  }

  getRiskProfile(): RiskProfile {
    return {
      atrMultiplierSL: 1.5,
      atrMultiplierTP: 2.0,
      minSLPercent: 1.0,
      maxSLPercent: 4.0,
      minTPPercent: 1.5,
      maxTPPercent: 6.0,
    };
  }

  async analyze(candles: Candle[]): Promise<Signal> {
    if (candles.length < this.lookback + 10) {
      return "hold";
    }

    const i = candles.length - 1;
    const closes = candles.map(c => c.close);

    // Calculate VWAP bands
    const vwapBands = indicators.VWAPBands(candles, [1, 2, 3]);
    const rollingVwap = indicators.RollingVWAP(candles, this.lookback);

    // Calculate volume delta (buying vs selling pressure)
    // Approximation: If close > open, volume is buying; if close < open, volume is selling
    const volumeDeltas: number[] = [];
    for (let j = 0; j < candles.length; j++) {
      const c = candles[j];
      const delta = c.close > c.open ? c.volume : (c.close < c.open ? -c.volume : 0);
      volumeDeltas.push(delta);
    }

    // Calculate cumulative volume delta over last 5 bars
    const recentDeltas = volumeDeltas.slice(-5);
    const cumulativeDelta = recentDeltas.reduce((sum, d) => sum + d, 0);
    const avgVolume = candles.slice(-20).reduce((sum, c) => sum + c.volume, 0) / 20;

    // Get current values
    const currentClose = closes[i];
    const currentVWAP = rollingVwap[i];
    const upperBand2 = vwapBands.upperBand2[i];
    const lowerBand2 = vwapBands.lowerBand2[i];

    // Skip if indicators not ready
    if (isNaN(currentVWAP) || isNaN(upperBand2) || isNaN(lowerBand2)) {
      return "hold";
    }

    // Calculate deviation from VWAP as percentage
    const deviationPercent = ((currentClose - currentVWAP) / currentVWAP) * 100;

    // Volume confirmation - significant selling/buying pressure against price move
    const significantVolume = Math.abs(cumulativeDelta) > avgVolume * 0.5;

    // BUY: Price at lower band + selling exhaustion (delta turning positive)
    const isBuySignal = (
      currentClose <= lowerBand2 && // Price at -2 std dev
      deviationPercent < -1.5 && // Significant deviation from VWAP
      cumulativeDelta > 0 && // Buying pressure emerging
      significantVolume
    );

    // SELL: Price at upper band + buying exhaustion (delta turning negative)
    const isSellSignal = (
      currentClose >= upperBand2 && // Price at +2 std dev
      deviationPercent > 1.5 && // Significant deviation from VWAP
      cumulativeDelta < 0 && // Selling pressure emerging
      significantVolume
    );

    if (isBuySignal) {
      return "buy";
    }

    if (isSellSignal) {
      return "sell";
    }

    return "hold";
  }
}

export default new VolumeWeightedMeanReversionStrategy();
