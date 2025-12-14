// Ichimoku Cloud Trend Strategy
// Full Ichimoku implementation with Tenkan/Kijun crossovers and cloud confirmation
// Optimized settings for crypto (faster periods due to 24/7 markets)

import { BaseStrategy, type Signal, type StrategyMetadata, type RiskProfile } from "../_base/strategy-interface.js";
import type { Candle } from "../../indicators/index.js";
import * as indicators from "../../indicators/index.js";

class IchimokuCloudTrendStrategy extends BaseStrategy {
  id = "trend/ichimoku-cloud-trend-v1";
  name = "Ichimoku Cloud Trend";
  description = "Trend following using Ichimoku Cloud with Tenkan/Kijun crossovers and cloud confirmation";
  category = "trend" as const;

  // Crypto-optimized Ichimoku settings (faster than traditional 9/26/52)
  private tenkanPeriod = 9;
  private kijunPeriod = 26;
  private senkouBPeriod = 52;
  private displacement = 26;

  getMetadata(): StrategyMetadata {
    return {
      minDataPoints: 80,
      preferredIntervals: [60, 240, 1440], // 1h, 4h, 1d
      suitableMarketConditions: ["trending"],
      complexity: "complex",
      author: "claude-iteration-1",
      version: "1.0.0",
      createdAt: new Date().toISOString(),
    };
  }

  getRiskProfile(): RiskProfile {
    return {
      atrMultiplierSL: 2.5,
      atrMultiplierTP: 5.0,
      minSLPercent: 2.0,
      maxSLPercent: 8.0,
      minTPPercent: 4.0,
      maxTPPercent: 20.0,
    };
  }

  async analyze(candles: Candle[]): Promise<Signal> {
    if (candles.length < this.senkouBPeriod + this.displacement + 5) {
      return "hold";
    }

    const ichimoku = indicators.IchimokuCloud(
      candles,
      this.tenkanPeriod,
      this.kijunPeriod,
      this.senkouBPeriod,
      this.displacement
    );

    const i = candles.length - 1;
    const prev = i - 1;
    const currentClose = candles[i].close;

    // Get Ichimoku values
    const tenkan = ichimoku.tenkan[i];
    const kijun = ichimoku.kijun[i];
    const prevTenkan = ichimoku.tenkan[prev];
    const prevKijun = ichimoku.kijun[prev];
    const cloudTop = ichimoku.cloudTop[i];
    const cloudBottom = ichimoku.cloudBottom[i];
    const cloudBullish = ichimoku.cloudBullish[i];

    // Skip if indicators not ready
    if (isNaN(tenkan) || isNaN(kijun) || isNaN(cloudTop) || isNaN(cloudBottom)) {
      return "hold";
    }

    // Tenkan/Kijun crossover detection
    const bullishCross = prevTenkan <= prevKijun && tenkan > kijun;
    const bearishCross = prevTenkan >= prevKijun && tenkan < kijun;

    // Price position relative to cloud
    const priceAboveCloud = currentClose > cloudTop;
    const priceBelowCloud = currentClose < cloudBottom;
    const priceInCloud = currentClose >= cloudBottom && currentClose <= cloudTop;

    // Strong trend conditions
    const strongBullish = priceAboveCloud && cloudBullish && tenkan > kijun;
    const strongBearish = priceBelowCloud && !cloudBullish && tenkan < kijun;

    // BUY signals:
    // 1. Bullish TK cross above the cloud (strongest)
    // 2. Bullish TK cross with price above cloud
    // 3. Price breaks above cloud with existing bullish TK alignment
    if (bullishCross && priceAboveCloud) {
      return "buy";
    }

    if (bullishCross && !priceBelowCloud && cloudBullish) {
      return "buy";
    }

    // Price emerging from cloud with bullish alignment
    if (priceAboveCloud && tenkan > kijun && cloudBullish) {
      const prevClose = candles[prev].close;
      const prevCloudTop = ichimoku.cloudTop[prev];
      if (!isNaN(prevCloudTop) && prevClose <= prevCloudTop) {
        return "buy"; // Just broke above cloud
      }
    }

    // SELL signals:
    // 1. Bearish TK cross below the cloud (strongest)
    // 2. Bearish TK cross with price below cloud
    // 3. Price breaks below cloud with existing bearish TK alignment
    if (bearishCross && priceBelowCloud) {
      return "sell";
    }

    if (bearishCross && !priceAboveCloud && !cloudBullish) {
      return "sell";
    }

    // Price falling from cloud with bearish alignment
    if (priceBelowCloud && tenkan < kijun && !cloudBullish) {
      const prevClose = candles[prev].close;
      const prevCloudBottom = ichimoku.cloudBottom[prev];
      if (!isNaN(prevCloudBottom) && prevClose >= prevCloudBottom) {
        return "sell"; // Just broke below cloud
      }
    }

    return "hold";
  }
}

export default new IchimokuCloudTrendStrategy();
