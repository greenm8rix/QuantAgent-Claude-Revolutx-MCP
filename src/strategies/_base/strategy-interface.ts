// Strategy Interface - Base types for modular strategies
// Claude can create new strategies by implementing these interfaces

import type { Candle } from "../../indicators/index.js";

// Signal types
export type Signal = "buy" | "sell" | "hold";

// Risk profile for dynamic SL/TP
export interface RiskProfile {
  atrMultiplierSL: number;  // ATR multiplier for stop loss
  atrMultiplierTP: number;  // ATR multiplier for take profit
  minSLPercent: number;     // Minimum SL floor
  maxSLPercent: number;     // Maximum SL ceiling
  minTPPercent: number;     // Minimum TP
  maxTPPercent: number;     // Maximum TP
}

// Strategy metadata for backtest optimization
export interface StrategyMetadata {
  minDataPoints: number;              // Minimum candles needed (e.g., 100 for EMA50)
  preferredIntervals: number[];       // Optimal intervals in minutes (e.g., [15, 60, 240])
  suitableMarketConditions: string[]; // e.g., ["trending", "volatile", "ranging"]
  complexity: "simple" | "moderate" | "complex";
  author?: string;                    // Creator (e.g., "claude-iteration-67")
  version?: string;                   // Strategy version
  createdAt?: string;                 // ISO timestamp
}

// Suggested SL/TP levels
export interface SuggestedSLTP {
  stopLoss: number;   // Price level
  takeProfit: number; // Price level
}

// Main strategy interface - implement this for new strategies
export interface Strategy {
  // Unique identifier (e.g., "momentum/macd-divergence-v1")
  id: string;

  // Human-readable name
  name: string;

  // Description of what the strategy does
  description: string;

  // Strategy category - determines risk profile defaults
  category: "momentum" | "mean_reversion" | "trend" | "scalping" | "composite";

  // Optional: Initialize with historical data (for ML strategies)
  initialize?(candles: Candle[]): Promise<void>;

  // Main analysis method - returns buy/sell/hold signal
  analyze(candles: Candle[]): Promise<Signal>;

  // Get strategy metadata
  getMetadata(): StrategyMetadata;

  // Get risk profile for this strategy
  getRiskProfile(): RiskProfile;

  // Calculate suggested SL/TP based on price and ATR
  getSuggestedSLTP(price: number, atr: number, side: "long" | "short"): SuggestedSLTP;
}

// Default risk profiles by category
export const DEFAULT_RISK_PROFILES: Record<string, RiskProfile> = {
  scalping: {
    atrMultiplierSL: 1.0,
    atrMultiplierTP: 1.5,
    minSLPercent: 0.5,
    maxSLPercent: 2.0,
    minTPPercent: 0.8,
    maxTPPercent: 3.0,
  },
  trend: {
    atrMultiplierSL: 2.0,
    atrMultiplierTP: 4.0,
    minSLPercent: 2.0,
    maxSLPercent: 8.0,
    minTPPercent: 4.0,
    maxTPPercent: 20.0,
  },
  mean_reversion: {
    atrMultiplierSL: 1.5,
    atrMultiplierTP: 2.0,
    minSLPercent: 1.0,
    maxSLPercent: 4.0,
    minTPPercent: 1.5,
    maxTPPercent: 6.0,
  },
  momentum: {
    atrMultiplierSL: 1.5,
    atrMultiplierTP: 3.0,
    minSLPercent: 1.5,
    maxSLPercent: 5.0,
    minTPPercent: 3.0,
    maxTPPercent: 12.0,
  },
  composite: {
    atrMultiplierSL: 1.8,
    atrMultiplierTP: 3.5,
    minSLPercent: 1.5,
    maxSLPercent: 6.0,
    minTPPercent: 3.0,
    maxTPPercent: 15.0,
  },
};

// Helper function to calculate SL/TP with ATR
export function calculateSLTP(
  price: number,
  atr: number,
  side: "long" | "short",
  profile: RiskProfile
): SuggestedSLTP {
  const atrPercent = (atr / price) * 100;

  let slPercent = atrPercent * profile.atrMultiplierSL;
  let tpPercent = atrPercent * profile.atrMultiplierTP;

  // Clamp to bounds
  slPercent = Math.max(profile.minSLPercent, Math.min(profile.maxSLPercent, slPercent));
  tpPercent = Math.max(profile.minTPPercent, Math.min(profile.maxTPPercent, tpPercent));

  const stopLoss = side === "long"
    ? price * (1 - slPercent / 100)
    : price * (1 + slPercent / 100);

  const takeProfit = side === "long"
    ? price * (1 + tpPercent / 100)
    : price * (1 - tpPercent / 100);

  return { stopLoss, takeProfit };
}

// Base class for easier strategy implementation
export abstract class BaseStrategy implements Strategy {
  abstract id: string;
  abstract name: string;
  abstract description: string;
  abstract category: "momentum" | "mean_reversion" | "trend" | "scalping" | "composite";

  abstract analyze(candles: Candle[]): Promise<Signal>;

  getMetadata(): StrategyMetadata {
    return {
      minDataPoints: 100,
      preferredIntervals: [15, 60, 240],
      suitableMarketConditions: ["trending", "volatile"],
      complexity: "moderate",
    };
  }

  getRiskProfile(): RiskProfile {
    return DEFAULT_RISK_PROFILES[this.category] || DEFAULT_RISK_PROFILES.momentum;
  }

  getSuggestedSLTP(price: number, atr: number, side: "long" | "short"): SuggestedSLTP {
    return calculateSLTP(price, atr, side, this.getRiskProfile());
  }
}
