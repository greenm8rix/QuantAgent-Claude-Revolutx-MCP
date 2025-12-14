// Market Structure Momentum Strategy
// Combines swing high/low detection with momentum for structure-based entries
// Uses Break of Structure (BOS) and Change of Character (CHoCH) concepts

import { BaseStrategy, type Signal, type StrategyMetadata, type RiskProfile } from "../_base/strategy-interface.js";
import type { Candle } from "../../indicators/index.js";
import * as indicators from "../../indicators/index.js";

class MarketStructureMomentumStrategy extends BaseStrategy {
  id = "composite/market-structure-momentum-v1";
  name = "Market Structure Momentum";
  description = "Smart money concepts with BOS/CHoCH detection combined with momentum confirmation";
  category = "composite" as const;

  private swingLookback = 5; // Bars on each side for swing detection
  private rsiPeriod = 14;

  getMetadata(): StrategyMetadata {
    return {
      minDataPoints: 50,
      preferredIntervals: [15, 60, 240],
      suitableMarketConditions: ["trending", "volatile"],
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
    if (candles.length < this.swingLookback * 4 + 10) {
      return "hold";
    }

    const i = candles.length - 1;
    const closes = candles.map(c => c.close);

    // Get market structure
    const structure = indicators.MarketStructure(candles, this.swingLookback);

    // Get RSI for momentum confirmation
    const rsi = indicators.RSI_Simple(closes, this.rsiPeriod);

    // Get ADX for trend strength
    const adx = indicators.ADX(candles, 14);

    // Current values
    const currentClose = closes[i];
    const currentRSI = rsi[i];
    const prevRSI = rsi[i - 1];
    const currentTrend = structure.trend[i];
    const currentADX = adx.adx[i];
    const lastSwingHigh = structure.lastSwingHigh[i];
    const lastSwingLow = structure.lastSwingLow[i];

    // Check for recent BOS or CHoCH (within last 3 bars)
    let recentBullishBOS = false;
    let recentBearishBOS = false;
    let recentBullishCHoCH = false;
    let recentBearishCHoCH = false;

    for (let j = Math.max(0, i - 3); j <= i; j++) {
      if (structure.bos[j] === 1) recentBullishBOS = true;
      if (structure.bos[j] === -1) recentBearishBOS = true;
      if (structure.choch[j] === 1) recentBullishCHoCH = true;
      if (structure.choch[j] === -1) recentBearishCHoCH = true;
    }

    // Skip if indicators not ready
    if (isNaN(currentRSI) || isNaN(currentADX)) {
      return "hold";
    }

    // RSI conditions
    const rsiBullish = currentRSI > 40 && currentRSI < 75 && currentRSI > prevRSI;
    const rsiBearish = currentRSI < 60 && currentRSI > 25 && currentRSI < prevRSI;

    // Trend strength check
    const isTrending = currentADX > 20;

    // Price relative to structure
    const priceNearSwingHigh = !isNaN(lastSwingHigh) && currentClose > lastSwingHigh * 0.995;
    const priceNearSwingLow = !isNaN(lastSwingLow) && currentClose < lastSwingLow * 1.005;

    // BUY signals:
    // 1. Bullish CHoCH (trend reversal) with RSI confirmation
    // 2. Bullish BOS (trend continuation) with strong momentum
    // 3. Price breaking above swing high with trend confirmation
    if (recentBullishCHoCH && rsiBullish) {
      return "buy";
    }

    if (recentBullishBOS && rsiBullish && isTrending && currentTrend === 1) {
      return "buy";
    }

    // SELL signals:
    // 1. Bearish CHoCH (trend reversal) with RSI confirmation
    // 2. Bearish BOS (trend continuation) with strong momentum
    // 3. Price breaking below swing low with trend confirmation
    if (recentBearishCHoCH && rsiBearish) {
      return "sell";
    }

    if (recentBearishBOS && rsiBearish && isTrending && currentTrend === -1) {
      return "sell";
    }

    return "hold";
  }
}

export default new MarketStructureMomentumStrategy();
