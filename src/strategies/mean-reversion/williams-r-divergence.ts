// Williams %R Divergence Strategy
// Uses Williams %R overbought/oversold with divergence confirmation for reversals
// Based on Larry Williams' indicator and 2025 crypto trading research
// Source: KuCoin Learn, Bybit Learn, TradersPost

import { BaseStrategy, type Signal, type StrategyMetadata, type RiskProfile } from "../_base/strategy-interface.js";
import type { Candle } from "../../indicators/index.js";
import * as indicators from "../../indicators/index.js";

class WilliamsRDivergenceStrategy extends BaseStrategy {
  id = "mean-reversion/williams-r-divergence-v1";
  name = "Williams %R Divergence";
  description = "Mean reversion using Williams %R extremes with divergence confirmation for high-probability reversals";
  category = "mean_reversion" as const;

  // Williams %R parameters
  private period = 14;
  private overboughtLevel = -20;
  private oversoldLevel = -80;
  private divergenceLookback = 8;

  // Additional filters
  private rsiPeriod = 14;
  private volumeMultiplier = 1.0; // Minimum volume for confirmation

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
      atrMultiplierTP: 2.5,
      minSLPercent: 1.0,
      maxSLPercent: 4.0,
      minTPPercent: 2.0,
      maxTPPercent: 6.0,
    };
  }

  async analyze(candles: Candle[]): Promise<Signal> {
    if (candles.length < this.period + this.divergenceLookback + 5) {
      return "hold";
    }

    const closes = candles.map(c => c.close);
    const volumes = candles.map(c => c.volume);

    // Calculate Williams %R
    const willR = indicators.WilliamsR(candles, this.period);

    // Calculate RSI for confirmation
    const rsi = indicators.RSI_Simple(closes, this.rsiPeriod);

    // Volume SMA
    const volumeSMA = indicators.SMA(volumes, 20);

    const i = candles.length - 1;
    const currentWillR = willR[i];
    const prevWillR = willR[i - 1];
    const currentRSI = rsi[i];
    const currentVolume = volumes[i];
    const avgVolume = volumeSMA[i];
    const currentClose = closes[i];

    // Skip if indicators not ready
    if (isNaN(currentWillR) || isNaN(currentRSI) || isNaN(avgVolume)) {
      return "hold";
    }

    // Check for divergence over lookback period
    const lookbackWillR = willR.slice(i - this.divergenceLookback, i + 1);
    const lookbackCloses = closes.slice(i - this.divergenceLookback, i + 1);

    // Find extremes in lookback period
    let lowestWillR = Infinity, lowestWillRIdx = -1;
    let highestWillR = -Infinity, highestWillRIdx = -1;
    let lowestPrice = Infinity, lowestPriceIdx = -1;
    let highestPrice = -Infinity, highestPriceIdx = -1;

    for (let j = 0; j < lookbackWillR.length; j++) {
      if (!isNaN(lookbackWillR[j])) {
        if (lookbackWillR[j] < lowestWillR) {
          lowestWillR = lookbackWillR[j];
          lowestWillRIdx = j;
        }
        if (lookbackWillR[j] > highestWillR) {
          highestWillR = lookbackWillR[j];
          highestWillRIdx = j;
        }
      }
      if (lookbackCloses[j] < lowestPrice) {
        lowestPrice = lookbackCloses[j];
        lowestPriceIdx = j;
      }
      if (lookbackCloses[j] > highestPrice) {
        highestPrice = lookbackCloses[j];
        highestPriceIdx = j;
      }
    }

    // Bullish divergence: Price makes lower low, Williams %R makes higher low
    const hasBullishDivergence = (
      currentClose <= lowestPrice * 1.01 && // Near recent low
      lowestPriceIdx < this.divergenceLookback && // Low was in lookback
      currentWillR > lowestWillR * 0.9 && // Williams %R not at extreme low
      currentWillR < this.oversoldLevel // In oversold zone
    );

    // Bearish divergence: Price makes higher high, Williams %R makes lower high
    const hasBearishDivergence = (
      currentClose >= highestPrice * 0.99 && // Near recent high
      highestPriceIdx < this.divergenceLookback && // High was in lookback
      currentWillR < highestWillR * 0.9 && // Williams %R not at extreme high
      currentWillR > this.overboughtLevel // In overbought zone
    );

    // Volume confirmation (relaxed)
    const hasVolumeConfirm = currentVolume >= avgVolume * this.volumeMultiplier;

    // Williams %R turning signals
    const willRTurningUp = currentWillR > prevWillR && prevWillR < this.oversoldLevel;
    const willRTurningDown = currentWillR < prevWillR && prevWillR > this.overboughtLevel;

    // RSI confirmation
    const rsiBullish = currentRSI < 40;
    const rsiBearish = currentRSI > 60;

    // Buy signal: Oversold + turning up with bullish divergence or RSI confirm
    if (currentWillR < this.oversoldLevel && willRTurningUp) {
      if (hasBullishDivergence || rsiBullish) {
        return "buy";
      }
    }

    // Sell signal: Overbought + turning down with bearish divergence or RSI confirm
    if (currentWillR > this.overboughtLevel && willRTurningDown) {
      if (hasBearishDivergence || rsiBearish) {
        return "sell";
      }
    }

    return "hold";
  }
}

export default new WilliamsRDivergenceStrategy();
