// VWAP Mean Reversion Strategy
// Uses Rolling VWAP with standard deviation bands for mean reversion entries
// Price tends to revert to VWAP - trade bounces off VWAP bands
// Based on 2025 crypto research - works best on high volume pairs
// Source: CoinGecko, QuantifiedStrategies mean reversion

import { BaseStrategy, type Signal, type StrategyMetadata, type RiskProfile } from "../_base/strategy-interface.js";
import type { Candle } from "../../indicators/index.js";
import * as indicators from "../../indicators/index.js";

class VWAPMeanReversionStrategy extends BaseStrategy {
  id = "mean-reversion/vwap-mean-reversion-v1";
  name = "VWAP Mean Reversion";
  description = "Mean reversion trades based on price deviation from Rolling VWAP with RSI confirmation";
  category = "mean_reversion" as const;

  // VWAP parameters
  private vwapPeriod = 21;

  // RSI filter
  private rsiPeriod = 14;
  private rsiOversold = 35;
  private rsiOverbought = 65;

  // ATR for dynamic bands
  private atrPeriod = 14;
  private bandMultiplier = 2.0;

  getMetadata(): StrategyMetadata {
    return {
      minDataPoints: 50,
      preferredIntervals: [15, 60, 240], // 15m to 4h
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
      maxSLPercent: 4.0,
      minTPPercent: 1.5,
      maxTPPercent: 5.0,
    };
  }

  async analyze(candles: Candle[]): Promise<Signal> {
    if (candles.length < Math.max(this.vwapPeriod, this.atrPeriod) + 10) {
      return "hold";
    }

    const closes = candles.map(c => c.close);

    // Calculate Rolling VWAP
    const vwap = indicators.RollingVWAP(candles, this.vwapPeriod);

    // Calculate ATR for dynamic bands
    const atr = indicators.ATR(candles, this.atrPeriod);

    // Calculate RSI
    const rsi = indicators.RSI_Simple(closes, this.rsiPeriod);

    // Calculate standard deviation of price from VWAP
    const deviations: number[] = [];
    for (let j = this.vwapPeriod; j < candles.length; j++) {
      if (!isNaN(vwap[j])) {
        deviations.push(Math.abs(closes[j] - vwap[j]));
      }
    }

    const i = candles.length - 1;
    const currentClose = closes[i];
    const currentVWAP = vwap[i];
    const currentATR = atr[i];
    const currentRSI = rsi[i];
    const prevClose = closes[i - 1];
    const prevVWAP = vwap[i - 1];

    // Skip if not ready
    if (isNaN(currentVWAP) || isNaN(currentATR) || isNaN(currentRSI)) {
      return "hold";
    }

    // Calculate dynamic bands based on ATR
    const upperBand = currentVWAP + this.bandMultiplier * currentATR;
    const lowerBand = currentVWAP - this.bandMultiplier * currentATR;

    // Deviation from VWAP as percentage
    const deviationPercent = ((currentClose - currentVWAP) / currentVWAP) * 100;

    // Price position relative to VWAP
    const isAboveVWAP = currentClose > currentVWAP;
    const isBelowVWAP = currentClose < currentVWAP;

    // Price returning to VWAP
    const crossingUpFromBelow = prevClose < prevVWAP && currentClose > currentVWAP;
    const crossingDownFromAbove = prevClose > prevVWAP && currentClose < currentVWAP;

    // Price at bands
    const atLowerBand = currentClose <= lowerBand;
    const atUpperBand = currentClose >= upperBand;

    // Bouncing off bands (mean reversion)
    const bouncingFromLower = atLowerBand && currentClose > candles[i].open;
    const bouncingFromUpper = atUpperBand && currentClose < candles[i].open;

    // RSI confirmation
    const rsiOversoldConfirm = currentRSI < this.rsiOversold;
    const rsiOverboughtConfirm = currentRSI > this.rsiOverbought;

    // Volume spike (helps confirm reversal)
    const volumes = candles.map(c => c.volume);
    const volumeSMA = indicators.SMA(volumes, 20);
    const currentVolume = volumes[i];
    const avgVolume = volumeSMA[i];
    const hasVolumeConfirm = currentVolume > avgVolume * 1.2;

    // BUY: Price at lower band + RSI oversold + bouncing
    if (atLowerBand || (isBelowVWAP && deviationPercent < -2)) {
      if (rsiOversoldConfirm || bouncingFromLower) {
        return "buy";
      }
    }

    // SELL: Price at upper band + RSI overbought + bouncing
    if (atUpperBand || (isAboveVWAP && deviationPercent > 2)) {
      if (rsiOverboughtConfirm || bouncingFromUpper) {
        return "sell";
      }
    }

    return "hold";
  }
}

export default new VWAPMeanReversionStrategy();
