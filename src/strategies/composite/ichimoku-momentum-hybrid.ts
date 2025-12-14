// Ichimoku Momentum Hybrid Strategy V10
// Combines Ichimoku Cloud with RSI momentum for crypto-optimized entries
// Uses cloud position for trend, TK cross for signals, RSI for timing
// Ichimoku works well in crypto's trending nature

import { BaseStrategy, type Signal, type StrategyMetadata, type RiskProfile } from "../_base/strategy-interface.js";
import type { Candle } from "../../indicators/index.js";
import * as indicators from "../../indicators/index.js";

class IchimokuMomentumHybridStrategy extends BaseStrategy {
  id = "composite/ichimoku-momentum-hybrid-v10";
  name = "Ichimoku Momentum Hybrid";
  description = "Ichimoku cloud trend filter with TK cross signals and RSI timing confirmation";
  category = "composite" as const;

  // Ichimoku parameters (crypto-optimized: faster than traditional)
  private tenkanPeriod = 9;
  private kijunPeriod = 26;
  private senkouBPeriod = 52;
  private displacement = 26;

  // RSI timing
  private rsiPeriod = 14;
  private rsiBullishMin = 40;
  private rsiBullishMax = 70;
  private rsiBearishMin = 30;
  private rsiBearishMax = 60;

  // Volume confirmation
  private volumePeriod = 20;
  private volumeMultiplier = 1.15;

  getMetadata(): StrategyMetadata {
    return {
      minDataPoints: 80,
      preferredIntervals: [60, 240], // 1h and 4h work best
      suitableMarketConditions: ["trending"],
      complexity: "complex",
      author: "claude-iteration-v10",
      version: "10.0.0",
      createdAt: new Date().toISOString(),
    };
  }

  getRiskProfile(): RiskProfile {
    return {
      atrMultiplierSL: 2.0,
      atrMultiplierTP: 4.0,
      minSLPercent: 2.0,
      maxSLPercent: 7.0,
      minTPPercent: 4.0,
      maxTPPercent: 18.0,
    };
  }

  async analyze(candles: Candle[]): Promise<Signal> {
    if (candles.length < this.senkouBPeriod + this.displacement + 5) {
      return "hold";
    }

    const i = candles.length - 1;
    const closes = candles.map(c => c.close);
    const volumes = candles.map(c => c.volume);
    const currentClose = closes[i];

    // Calculate Ichimoku
    const ichimoku = indicators.IchimokuCloud(
      candles,
      this.tenkanPeriod,
      this.kijunPeriod,
      this.senkouBPeriod,
      this.displacement
    );

    const tenkan = ichimoku.tenkan[i];
    const kijun = ichimoku.kijun[i];
    const prevTenkan = ichimoku.tenkan[i - 1];
    const prevKijun = ichimoku.kijun[i - 1];
    const cloudTop = ichimoku.cloudTop[i];
    const cloudBottom = ichimoku.cloudBottom[i];
    const isBullishCloud = ichimoku.cloudBullish[i];

    // Skip if indicators not ready
    if (isNaN(tenkan) || isNaN(kijun) || isNaN(cloudTop)) {
      return "hold";
    }

    // RSI for timing
    const rsi = indicators.RSI_Simple(closes, this.rsiPeriod);
    const currentRSI = rsi[i];
    const prevRSI = rsi[i - 1];

    // Volume confirmation
    const volumeSMA = indicators.SMA(volumes, this.volumePeriod);
    const isHighVolume = volumes[i] > volumeSMA[i] * this.volumeMultiplier;

    // Cloud position
    const aboveCloud = currentClose > cloudTop;
    const belowCloud = currentClose < cloudBottom;
    const insideCloud = !aboveCloud && !belowCloud;

    // TK Cross (Tenkan-Kijun crossover)
    const tkBullishCross = prevTenkan <= prevKijun && tenkan > kijun;
    const tkBearishCross = prevTenkan >= prevKijun && tenkan < kijun;

    // Price vs TK
    const aboveTenkan = currentClose > tenkan;
    const aboveKijun = currentClose > kijun;
    const belowTenkan = currentClose < tenkan;
    const belowKijun = currentClose < kijun;

    // RSI momentum
    const rsiInBullishZone = currentRSI > this.rsiBullishMin && currentRSI < this.rsiBullishMax;
    const rsiInBearishZone = currentRSI > this.rsiBearishMin && currentRSI < this.rsiBearishMax;
    const rsiRising = currentRSI > prevRSI;
    const rsiFalling = currentRSI < prevRSI;

    // Strong Bullish: TK cross above cloud + RSI in zone + volume
    // Medium Bullish: Price above cloud + TK bullish + RSI confirmation
    const strongBullish = tkBullishCross && aboveCloud && rsiInBullishZone && rsiRising;
    const mediumBullish = aboveCloud && aboveTenkan && aboveKijun && isBullishCloud && rsiRising && currentRSI > 50;

    if (strongBullish || mediumBullish) {
      return "buy";
    }

    // Strong Bearish: TK cross below cloud + RSI in zone
    // Medium Bearish: Price below cloud + TK bearish + RSI confirmation
    const strongBearish = tkBearishCross && belowCloud && rsiInBearishZone && rsiFalling;
    const mediumBearish = belowCloud && belowTenkan && belowKijun && !isBullishCloud && rsiFalling && currentRSI < 50;

    if (strongBearish || mediumBearish) {
      return "sell";
    }

    return "hold";
  }
}

export default new IchimokuMomentumHybridStrategy();
