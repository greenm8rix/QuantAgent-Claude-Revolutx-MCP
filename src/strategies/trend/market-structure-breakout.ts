// Market Structure Breakout Strategy
// Based on Smart Money Concepts: BOS (Break of Structure) and CHoCH (Change of Character)
// Uses swing high/low detection for structure-based entries

import { BaseStrategy, type Signal, type StrategyMetadata, type RiskProfile } from "../_base/strategy-interface.js";
import type { Candle } from "../../indicators/index.js";
import * as indicators from "../../indicators/index.js";

class MarketStructureBreakoutStrategy extends BaseStrategy {
  id = "trend/market-structure-breakout-v1";
  name = "Market Structure Breakout";
  description = "Smart Money Concepts BOS/CHoCH detection with momentum confirmation";
  category = "trend" as const;

  // Structure detection parameters
  private swingLookback = 4;  // Candles to look left/right for swing detection
  private rsiPeriod = 14;
  private volumePeriod = 20;

  getMetadata(): StrategyMetadata {
    return {
      minDataPoints: 60,
      preferredIntervals: [60, 240], // 1h and 4h best for structure
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
      minSLPercent: 2.0,
      maxSLPercent: 6.0,
      minTPPercent: 4.0,
      maxTPPercent: 15.0,
    };
  }

  async analyze(candles: Candle[]): Promise<Signal> {
    if (candles.length < 60) return "hold";

    const closes = candles.map(c => c.close);
    const i = candles.length - 1;

    // Use the built-in Market Structure detector
    const structure = indicators.MarketStructure(candles, this.swingLookback);
    
    // Get current structure values
    const currentTrend = structure.trend[i];
    const currentBOS = structure.bos[i];
    const currentCHoCH = structure.choch[i];
    const lastSwingHigh = structure.lastSwingHigh[i];
    const lastSwingLow = structure.lastSwingLow[i];

    // Calculate supporting indicators
    const rsi = indicators.RSI_Simple(closes, this.rsiPeriod);
    const volumes = candles.map(c => c.volume);
    const volumeSMA = indicators.SMA(volumes, this.volumePeriod);
    
    const currentRSI = rsi[i];
    const currentClose = closes[i];
    const currentVolume = volumes[i];
    const avgVolume = volumeSMA[i];

    // Check for recent structure breaks (within last 3 candles)
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

    // Volume confirmation
    const hasVolumeSpike = currentVolume > avgVolume * 1.3;

    // Price relative to structure levels
    const aboveLastSwingHigh = !isNaN(lastSwingHigh) && currentClose > lastSwingHigh;
    const belowLastSwingLow = !isNaN(lastSwingLow) && currentClose < lastSwingLow;

    // ============== BULLISH SIGNAL ==============
    // CHoCH (trend reversal to bullish) or BOS (bullish continuation)
    // + Price above last swing high + RSI not overbought + Volume confirmation
    const bullishStructure = (
      (recentBullishCHoCH || (recentBullishBOS && currentTrend === 1)) &&
      currentRSI < 70 &&
      currentRSI > 30 &&  // Not oversold (waiting for confirmation)
      hasVolumeSpike
    );

    // Alternative: Clear break above swing high with momentum
    const bullishBreakout = (
      aboveLastSwingHigh &&
      currentTrend === 1 &&
      rsi[i] > rsi[i - 1] &&  // RSI rising
      hasVolumeSpike
    );

    // ============== BEARISH SIGNAL ==============
    // CHoCH (trend reversal to bearish) or BOS (bearish continuation)
    // + Price below last swing low + RSI not oversold + Volume confirmation
    const bearishStructure = (
      (recentBearishCHoCH || (recentBearishBOS && currentTrend === -1)) &&
      currentRSI > 30 &&
      currentRSI < 70 &&  // Not overbought (waiting for confirmation)
      hasVolumeSpike
    );

    // Alternative: Clear break below swing low with momentum
    const bearishBreakout = (
      belowLastSwingLow &&
      currentTrend === -1 &&
      rsi[i] < rsi[i - 1] &&  // RSI falling
      hasVolumeSpike
    );

    if (bullishStructure || bullishBreakout) {
      return "buy";
    }

    if (bearishStructure || bearishBreakout) {
      return "sell";
    }

    return "hold";
  }
}

export default new MarketStructureBreakoutStrategy();
