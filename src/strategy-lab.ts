// Strategy Lab - Generates and mutates trading strategies
// V2 - Improved with trend filtering, volume confirmation, and better exit logic
import * as indicators from "./indicators/index.js";
import type { Candle } from "./indicators/index.js";

export type Signal = "buy" | "sell" | "hold";

export interface StrategyConfig {
  id: string;
  name: string;
  indicators: IndicatorConfig[];
  rules: Rule[];
  params: Record<string, number>;
}

export interface IndicatorConfig {
  type: string;
  params: Record<string, number>;
}

export interface Rule {
  condition: string;
  action: Signal;
}

export interface StrategyResult {
  config: StrategyConfig;
  signals: Signal[];
  indicatorValues: Record<string, number[]>;
}

// Parameter ranges for optimization - V2 optimized ranges
export const PARAM_RANGES = {
  // Trend-following strategies work better with these
  EMA: {
    fastPeriod: [8, 13, 21],
    slowPeriod: [34, 55, 89, 144], // Fibonacci-based
  },
  // ADX for trend strength
  ADX: {
    period: [14, 20],
    threshold: [20, 25, 30], // Only trade when ADX > threshold
  },
  // Supertrend - popular on crypto
  Supertrend: {
    period: [10, 12, 14],
    multiplier: [2, 2.5, 3, 3.5],
  },
  // Donchian for breakouts
  Donchian: {
    period: [20, 30, 40, 55],
  },
  // Volume filter
  Volume: {
    period: [20, 30],
    multiplier: [1.0, 1.2, 1.5], // Require volume > multiplier * avgVolume
  },
  // RSI - but for momentum, not reversal
  RSI: {
    period: [7, 10, 14],
    momentumLong: [50, 55, 60], // Buy when RSI > this (momentum)
    momentumShort: [40, 45, 50], // Sell when RSI < this
  },
  // Keltner Channel for volatility breakouts
  Keltner: {
    emaPeriod: [20, 26],
    atrPeriod: [10, 14],
    multiplier: [1.5, 2, 2.5],
  },
  // MACD with tighter parameters for crypto
  MACD: {
    fastPeriod: [8, 12],
    slowPeriod: [17, 21, 26],
    signalPeriod: [9],
  },
};

// V2 Strategy Templates - More sophisticated approaches
export const STRATEGY_TEMPLATES: StrategyConfig[] = [
  // 1. Supertrend Trend Following - One of the best for crypto
  {
    id: "supertrend_trend",
    name: "Supertrend Trend Following",
    indicators: [
      { type: "Supertrend", params: { period: 10, multiplier: 3 } },
    ],
    rules: [
      { condition: "Supertrend flips bullish", action: "buy" },
      { condition: "Supertrend flips bearish", action: "sell" },
    ],
    params: { period: 10, multiplier: 3 },
  },
  // 2. Donchian Breakout - Classic turtle trading
  {
    id: "donchian_breakout",
    name: "Donchian Channel Breakout",
    indicators: [
      { type: "Donchian", params: { period: 20 } },
      { type: "ADX", params: { period: 14 } },
    ],
    rules: [
      { condition: "Price breaks above upper channel AND ADX > threshold", action: "buy" },
      { condition: "Price breaks below lower channel AND ADX > threshold", action: "sell" },
    ],
    params: { period: 20, adxThreshold: 20 },
  },
  // 3. EMA Trend + RSI Momentum - Only buy dips in uptrend
  {
    id: "ema_rsi_momentum",
    name: "EMA Trend + RSI Momentum",
    indicators: [
      { type: "EMA", params: { period: 21 } },
      { type: "EMA", params: { period: 55 } },
      { type: "RSI", params: { period: 14 } },
    ],
    rules: [
      { condition: "EMA21 > EMA55 AND RSI crosses above 50", action: "buy" },
      { condition: "EMA21 < EMA55 AND RSI crosses below 50", action: "sell" },
    ],
    params: { fastEMA: 21, slowEMA: 55, rsiPeriod: 14, rsiThreshold: 50 },
  },
  // 4. Keltner Channel Breakout with Volume
  {
    id: "keltner_volume_breakout",
    name: "Keltner Channel + Volume Breakout",
    indicators: [
      { type: "Keltner", params: { emaPeriod: 20, atrPeriod: 10, multiplier: 2 } },
      { type: "VolumeSMA", params: { period: 20 } },
    ],
    rules: [
      { condition: "Price closes above upper Keltner AND volume > avgVolume", action: "buy" },
      { condition: "Price closes below lower Keltner AND volume > avgVolume", action: "sell" },
    ],
    params: { emaPeriod: 20, atrPeriod: 10, multiplier: 2, volumePeriod: 20, volumeMultiplier: 1.2 },
  },
  // 5. MACD Histogram Momentum
  {
    id: "macd_histogram_momentum",
    name: "MACD Histogram Momentum",
    indicators: [
      { type: "MACD", params: { fastPeriod: 12, slowPeriod: 26, signalPeriod: 9 } },
      { type: "EMA", params: { period: 50 } },
    ],
    rules: [
      { condition: "MACD histogram turns positive AND price > EMA50", action: "buy" },
      { condition: "MACD histogram turns negative AND price < EMA50", action: "sell" },
    ],
    params: { macdFast: 12, macdSlow: 26, macdSignal: 9, trendEMA: 50 },
  },
  // 6. ADX + DI Crossover - Strong trend following
  {
    id: "adx_di_crossover",
    name: "ADX + DI Crossover",
    indicators: [
      { type: "ADX", params: { period: 14 } },
    ],
    rules: [
      { condition: "+DI crosses above -DI AND ADX > 20", action: "buy" },
      { condition: "-DI crosses above +DI AND ADX > 20", action: "sell" },
    ],
    params: { adxPeriod: 14, adxThreshold: 20 },
  },
  // 7. Hull MA Crossover - Fast and responsive
  {
    id: "hull_ma_trend",
    name: "Hull MA Trend",
    indicators: [
      { type: "HMA", params: { period: 9 } },
      { type: "HMA", params: { period: 21 } },
    ],
    rules: [
      { condition: "HMA9 crosses above HMA21", action: "buy" },
      { condition: "HMA9 crosses below HMA21", action: "sell" },
    ],
    params: { fastHMA: 9, slowHMA: 21 },
  },
  // 8. Parabolic SAR Trend - Good for trailing
  {
    id: "parabolic_sar_trend",
    name: "Parabolic SAR Trend",
    indicators: [
      { type: "ParabolicSAR", params: { afStart: 0.02, afStep: 0.02, afMax: 0.2 } },
      { type: "ADX", params: { period: 14 } },
    ],
    rules: [
      { condition: "SAR flips below price AND ADX > 20", action: "buy" },
      { condition: "SAR flips above price AND ADX > 20", action: "sell" },
    ],
    params: { afStart: 0.02, afStep: 0.02, afMax: 0.2, adxThreshold: 20 },
  },
  // 9. Triple Screen - Elder's method (simplified)
  {
    id: "triple_screen",
    name: "Triple Screen (Simplified)",
    indicators: [
      { type: "EMA", params: { period: 13 } },
      { type: "EMA", params: { period: 26 } },
      { type: "MACD", params: { fastPeriod: 12, slowPeriod: 26, signalPeriod: 9 } },
      { type: "StochRSI", params: { rsiPeriod: 14, stochPeriod: 14 } },
    ],
    rules: [
      { condition: "EMA13 > EMA26 AND MACD histogram rising AND StochRSI < 30", action: "buy" },
      { condition: "EMA13 < EMA26 AND MACD histogram falling AND StochRSI > 70", action: "sell" },
    ],
    params: { ema1: 13, ema2: 26, stochOversold: 30, stochOverbought: 70 },
  },
  // 10. Momentum Surge - High conviction entries
  {
    id: "momentum_surge",
    name: "Momentum Surge",
    indicators: [
      { type: "RSI", params: { period: 14 } },
      { type: "ADX", params: { period: 14 } },
      { type: "EMA", params: { period: 20 } },
    ],
    rules: [
      { condition: "RSI > 55 AND ADX > 25 AND price > EMA20", action: "buy" },
      { condition: "RSI < 45 AND ADX > 25 AND price < EMA20", action: "sell" },
    ],
    params: { rsiPeriod: 14, adxPeriod: 14, emaPeriod: 20, rsiLong: 55, rsiShort: 45, adxThreshold: 25 },
  },
  // 11. Bollinger Squeeze Breakout - Volatility expansion
  {
    id: "bollinger_squeeze",
    name: "Bollinger Squeeze Breakout",
    indicators: [
      { type: "Bollinger", params: { period: 20, stdDev: 2 } },
      { type: "Keltner", params: { emaPeriod: 20, atrPeriod: 10, multiplier: 1.5 } },
    ],
    rules: [
      { condition: "BB inside Keltner (squeeze) AND price breaks upper BB", action: "buy" },
      { condition: "BB inside Keltner (squeeze) AND price breaks lower BB", action: "sell" },
    ],
    params: { bbPeriod: 20, bbStd: 2, keltnerEMA: 20, keltnerATR: 10, keltnerMult: 1.5 },
  },
  // 12. CMF + Price Action - Volume-confirmed moves
  {
    id: "cmf_price_action",
    name: "CMF + Price Action",
    indicators: [
      { type: "CMF", params: { period: 20 } },
      { type: "EMA", params: { period: 21 } },
    ],
    rules: [
      { condition: "CMF > 0.1 AND price crosses above EMA21", action: "buy" },
      { condition: "CMF < -0.1 AND price crosses below EMA21", action: "sell" },
    ],
    params: { cmfPeriod: 20, emaPeriod: 21, cmfThreshold: 0.1 },
  },
  // 13. Fast EMA Scalper - Quick entries on fast timeframes
  {
    id: "fast_ema_scalper",
    name: "Fast EMA Scalper",
    indicators: [
      { type: "EMA", params: { period: 5 } },
      { type: "EMA", params: { period: 13 } },
      { type: "RSI", params: { period: 7 } },
    ],
    rules: [
      { condition: "EMA5 crosses above EMA13 AND RSI > 50", action: "buy" },
      { condition: "EMA5 crosses below EMA13 AND RSI < 50", action: "sell" },
    ],
    params: { fastEMA: 5, slowEMA: 13, rsiPeriod: 7, rsiMidline: 50 },
  },
  // 14. Momentum Burst - High momentum entries
  {
    id: "momentum_burst",
    name: "Momentum Burst",
    indicators: [
      { type: "RSI", params: { period: 7 } },
      { type: "ADX", params: { period: 10 } },
      { type: "EMA", params: { period: 10 } },
    ],
    rules: [
      { condition: "RSI > 60 AND ADX > 30 AND price > EMA10", action: "buy" },
      { condition: "RSI < 40 AND ADX > 30 AND price < EMA10", action: "sell" },
    ],
    params: { rsiPeriod: 7, adxPeriod: 10, emaPeriod: 10, rsiLong: 60, rsiShort: 40, adxThreshold: 30 },
  },
  // 15. VWAP Bounce Scalper - VWAP mean reversion with momentum filter
  {
    id: "vwap_bounce",
    name: "VWAP Bounce Scalper",
    indicators: [
      { type: "VWAP", params: {} },
      { type: "RSI", params: { period: 9 } },
    ],
    rules: [
      { condition: "Price crosses above VWAP AND RSI > 45", action: "buy" },
      { condition: "Price crosses below VWAP AND RSI < 55", action: "sell" },
    ],
    params: { rsiPeriod: 9 },
  },
  // 16. Range Breakout - ATR-based volatility expansion
  {
    id: "range_breakout",
    name: "Range Breakout (ATR)",
    indicators: [
      { type: "ATR", params: { period: 10 } },
      { type: "EMA", params: { period: 20 } },
    ],
    rules: [
      { condition: "Price breaks above EMA + 1.5*ATR", action: "buy" },
      { condition: "Price breaks below EMA - 1.5*ATR", action: "sell" },
    ],
    params: { atrPeriod: 10, emaPeriod: 20, atrMultiplier: 1.5 },
  },
  // 17. Williams %R Oversold/Overbought
  {
    id: "williams_r_extremes",
    name: "Williams %R Extremes",
    indicators: [
      { type: "WilliamsR", params: { period: 14 } },
      { type: "EMA", params: { period: 20 } },
    ],
    rules: [
      { condition: "Williams %R crosses above -80 AND price > EMA20", action: "buy" },
      { condition: "Williams %R crosses below -20 AND price < EMA20", action: "sell" },
    ],
    params: { period: 14, emaPeriod: 20, oversold: -80, overbought: -20 },
  },

  // ============ SCALPING STRATEGIES (5m/15m) ============
  // These trade frequently, embrace noise, use mean reversion

  // 18. RSI Bounce Scalper - Buy oversold, sell overbought (no trend filter)
  {
    id: "rsi_bounce_scalp",
    name: "RSI Bounce Scalper",
    indicators: [
      { type: "RSI", params: { period: 5 } },
    ],
    rules: [
      { condition: "RSI drops below 25 then rises", action: "buy" },
      { condition: "RSI rises above 75 then drops", action: "sell" },
    ],
    params: { rsiPeriod: 5, oversold: 25, overbought: 75 },
  },

  // 19. Bollinger Bounce Scalper - Mean reversion to middle band
  {
    id: "bb_bounce_scalp",
    name: "Bollinger Bounce Scalper",
    indicators: [
      { type: "Bollinger", params: { period: 10, stdDev: 2 } },
    ],
    rules: [
      { condition: "Price touches lower BB and bounces", action: "buy" },
      { condition: "Price touches upper BB and bounces", action: "sell" },
    ],
    params: { period: 10, stdDev: 2 },
  },

  // 20. Micro EMA Scalper - Ultra fast crossovers
  {
    id: "micro_ema_scalp",
    name: "Micro EMA Scalper",
    indicators: [
      { type: "EMA", params: { period: 3 } },
      { type: "EMA", params: { period: 8 } },
    ],
    rules: [
      { condition: "EMA3 crosses above EMA8", action: "buy" },
      { condition: "EMA3 crosses below EMA8", action: "sell" },
    ],
    params: { fastEMA: 3, slowEMA: 8 },
  },

  // 21. Stoch Scalper - Stochastic oversold/overbought
  {
    id: "stoch_scalp",
    name: "Stochastic Scalper",
    indicators: [
      { type: "StochRSI", params: { rsiPeriod: 7, stochPeriod: 7 } },
    ],
    rules: [
      { condition: "StochRSI crosses above 20", action: "buy" },
      { condition: "StochRSI crosses below 80", action: "sell" },
    ],
    params: { rsiPeriod: 7, stochPeriod: 7, oversold: 20, overbought: 80 },
  },

  // 22. Price Action Scalper - Candle patterns
  {
    id: "candle_scalp",
    name: "Price Action Scalper",
    indicators: [],
    rules: [
      { condition: "Bullish engulfing or hammer", action: "buy" },
      { condition: "Bearish engulfing or shooting star", action: "sell" },
    ],
    params: {},
  },

  // 23. Volatility Scalper - Trade when ATR spikes
  {
    id: "volatility_scalp",
    name: "Volatility Scalper",
    indicators: [
      { type: "ATR", params: { period: 5 } },
      { type: "EMA", params: { period: 5 } },
    ],
    rules: [
      { condition: "ATR spikes AND price > EMA5", action: "buy" },
      { condition: "ATR spikes AND price < EMA5", action: "sell" },
    ],
    params: { atrPeriod: 5, emaPeriod: 5, atrMultiplier: 1.5 },
  },

  // 24. MACD Zero Cross Scalper - Quick MACD signals
  {
    id: "macd_zero_scalp",
    name: "MACD Zero Cross Scalper",
    indicators: [
      { type: "MACD", params: { fastPeriod: 5, slowPeriod: 13, signalPeriod: 4 } },
    ],
    rules: [
      { condition: "MACD crosses above zero", action: "buy" },
      { condition: "MACD crosses below zero", action: "sell" },
    ],
    params: { fastPeriod: 5, slowPeriod: 13, signalPeriod: 4 },
  },

  // ============ V3 AGGRESSIVE MOMENTUM STRATEGIES ============
  // These strategies are designed for volatile crypto markets
  // Focus on catching explosive moves with proper risk management

  // 25. RSI Momentum Burst - Enter on strong RSI with trend confirmation
  {
    id: "rsi_momentum_burst",
    name: "RSI Momentum Burst",
    indicators: [
      { type: "RSI", params: { period: 9 } },
      { type: "EMA", params: { period: 21 } },
      { type: "ADX", params: { period: 14 } },
    ],
    rules: [
      { condition: "RSI > 65 AND price > EMA21 AND ADX > 20", action: "buy" },
      { condition: "RSI < 35 AND price < EMA21 AND ADX > 20", action: "sell" },
    ],
    params: { rsiPeriod: 9, emaPeriod: 21, adxPeriod: 14, rsiLong: 65, rsiShort: 35, adxThreshold: 20 },
  },

  // 26. Breakout Explosion - ATR expansion with price breakout
  {
    id: "breakout_explosion",
    name: "Breakout Explosion",
    indicators: [
      { type: "ATR", params: { period: 14 } },
      { type: "Donchian", params: { period: 10 } },
    ],
    rules: [
      { condition: "Price breaks 10-bar high AND ATR expanding", action: "buy" },
      { condition: "Price breaks 10-bar low AND ATR expanding", action: "sell" },
    ],
    params: { atrPeriod: 14, donchianPeriod: 10, atrExpansion: 1.3 },
  },

  // 27. Triple Momentum Confluence - RSI + MACD + ADX alignment
  {
    id: "triple_momentum",
    name: "Triple Momentum Confluence",
    indicators: [
      { type: "RSI", params: { period: 14 } },
      { type: "MACD", params: { fastPeriod: 12, slowPeriod: 26, signalPeriod: 9 } },
      { type: "ADX", params: { period: 14 } },
    ],
    rules: [
      { condition: "RSI > 55 AND MACD > signal AND ADX > 25", action: "buy" },
      { condition: "RSI < 45 AND MACD < signal AND ADX > 25", action: "sell" },
    ],
    params: { rsiPeriod: 14, rsiLong: 55, rsiShort: 45, adxThreshold: 25 },
  },

  // 28. Volume Climax Reversal - High volume at extremes signals reversal
  {
    id: "volume_climax",
    name: "Volume Climax Reversal",
    indicators: [
      { type: "VolumeSMA", params: { period: 20 } },
      { type: "RSI", params: { period: 14 } },
      { type: "Bollinger", params: { period: 20, stdDev: 2 } },
    ],
    rules: [
      { condition: "Volume > 2x avg AND price at lower BB AND RSI < 30", action: "buy" },
      { condition: "Volume > 2x avg AND price at upper BB AND RSI > 70", action: "sell" },
    ],
    params: { volumePeriod: 20, volumeMultiplier: 2, rsiPeriod: 14, bbPeriod: 20 },
  },

  // 29. EMA Ribbon Momentum - Multiple EMA alignment
  {
    id: "ema_ribbon",
    name: "EMA Ribbon Momentum",
    indicators: [
      { type: "EMA", params: { period: 8 } },
      { type: "EMA", params: { period: 13 } },
      { type: "EMA", params: { period: 21 } },
      { type: "EMA", params: { period: 34 } },
    ],
    rules: [
      { condition: "EMA8 > EMA13 > EMA21 > EMA34 (perfect alignment)", action: "buy" },
      { condition: "EMA8 < EMA13 < EMA21 < EMA34 (perfect alignment)", action: "sell" },
    ],
    params: { ema1: 8, ema2: 13, ema3: 21, ema4: 34 },
  },

  // 30. ROC Momentum Spike - Rate of change explosion
  {
    id: "roc_spike",
    name: "ROC Momentum Spike",
    indicators: [
      { type: "ROC", params: { period: 10 } },
      { type: "EMA", params: { period: 20 } },
    ],
    rules: [
      { condition: "ROC > threshold AND price > EMA20", action: "buy" },
      { condition: "ROC < -threshold AND price < EMA20", action: "sell" },
    ],
    params: { rocPeriod: 10, emaPeriod: 20, threshold: 2 },
  },

  // 31. MFI Divergence - Money flow divergence signals
  {
    id: "mfi_momentum",
    name: "MFI Momentum",
    indicators: [
      { type: "MFI", params: { period: 14 } },
      { type: "EMA", params: { period: 20 } },
    ],
    rules: [
      { condition: "MFI crosses above 50 AND price > EMA20", action: "buy" },
      { condition: "MFI crosses below 50 AND price < EMA20", action: "sell" },
    ],
    params: { mfiPeriod: 14, emaPeriod: 20 },
  },

  // 32. OBV Breakout - On Balance Volume confirms price breakout
  {
    id: "obv_breakout",
    name: "OBV Breakout",
    indicators: [
      { type: "OBV", params: {} },
      { type: "Donchian", params: { period: 20 } },
    ],
    rules: [
      { condition: "Price breaks Donchian high AND OBV rising", action: "buy" },
      { condition: "Price breaks Donchian low AND OBV falling", action: "sell" },
    ],
    params: { donchianPeriod: 20 },
  },

  // 33. CCI Momentum - Commodity Channel Index extremes
  {
    id: "cci_momentum",
    name: "CCI Momentum",
    indicators: [
      { type: "CCI", params: { period: 20 } },
      { type: "EMA", params: { period: 50 } },
    ],
    rules: [
      { condition: "CCI crosses above 100 AND price > EMA50", action: "buy" },
      { condition: "CCI crosses below -100 AND price < EMA50", action: "sell" },
    ],
    params: { cciPeriod: 20, emaPeriod: 50, cciThreshold: 100 },
  },

  // 34. Price Channel Position - Buy low in channel, sell high
  {
    id: "channel_position",
    name: "Price Channel Position",
    indicators: [
      { type: "PriceChannelPosition", params: { period: 20 } },
      { type: "ADX", params: { period: 14 } },
    ],
    rules: [
      { condition: "Channel position < 20 AND ADX < 25 (ranging)", action: "buy" },
      { condition: "Channel position > 80 AND ADX < 25 (ranging)", action: "sell" },
    ],
    params: { period: 20, adxPeriod: 14, lowThreshold: 20, highThreshold: 80, adxRangeThreshold: 25 },
  },

  // ============ V4 STRATEGIES - OPTIMIZED FOR 2-5% DAILY RETURNS ============
  // Based on research: VWAP-MACD-RSI multi-factor, range trading, and momentum

  // 35. VWAP-MACD-RSI Multi-Factor - Triple confirmation system (73% win rate backtested)
  {
    id: "vwap_macd_rsi",
    name: "VWAP-MACD-RSI Multi-Factor",
    indicators: [
      { type: "VWAP", params: {} },
      { type: "MACD", params: { fastPeriod: 12, slowPeriod: 26, signalPeriod: 9 } },
      { type: "RSI", params: { period: 14 } },
    ],
    rules: [
      { condition: "Price > VWAP AND MACD > signal AND RSI > 30 AND RSI < 70", action: "buy" },
      { condition: "Price < VWAP AND MACD < signal AND RSI > 30 AND RSI < 70", action: "sell" },
    ],
    params: { rsiPeriod: 14, rsiOverbought: 70, rsiOversold: 30 },
  },

  // 36. RSI Bollinger Confluence - RSI extremes + BB touches for high probability
  {
    id: "rsi_bb_confluence",
    name: "RSI Bollinger Confluence",
    indicators: [
      { type: "RSI", params: { period: 14 } },
      { type: "Bollinger", params: { period: 20, stdDev: 2 } },
    ],
    rules: [
      { condition: "RSI < 30 AND price at lower BB", action: "buy" },
      { condition: "RSI > 70 AND price at upper BB", action: "sell" },
    ],
    params: { rsiPeriod: 14, bbPeriod: 20, bbStdDev: 2, rsiOversold: 30, rsiOverbought: 70 },
  },

  // 37. Fast EMA Stack - 3/8/21 alignment for quick trend entries
  {
    id: "fast_ema_stack",
    name: "Fast EMA Stack",
    indicators: [
      { type: "EMA", params: { period: 3 } },
      { type: "EMA", params: { period: 8 } },
      { type: "EMA", params: { period: 21 } },
      { type: "RSI", params: { period: 9 } },
    ],
    rules: [
      { condition: "EMA3 > EMA8 > EMA21 AND RSI > 50", action: "buy" },
      { condition: "EMA3 < EMA8 < EMA21 AND RSI < 50", action: "sell" },
    ],
    params: { rsiPeriod: 9 },
  },

  // 38. ATR Optimal Volatility - Only trade when ATR is in optimal range
  {
    id: "atr_optimal_vol",
    name: "ATR Optimal Volatility",
    indicators: [
      { type: "ATR", params: { period: 14 } },
      { type: "EMA", params: { period: 20 } },
      { type: "RSI", params: { period: 14 } },
    ],
    rules: [
      { condition: "ATR in optimal range AND price > EMA AND RSI crosses 50", action: "buy" },
      { condition: "ATR in optimal range AND price < EMA AND RSI crosses 50", action: "sell" },
    ],
    params: { atrPeriod: 14, emaPeriod: 20, rsiPeriod: 14, atrMinPct: 0.5, atrMaxPct: 3.0 },
  },

  // 39. Support Resistance Bounce - Donchian-based range trading
  {
    id: "sr_bounce",
    name: "Support Resistance Bounce",
    indicators: [
      { type: "Donchian", params: { period: 20 } },
      { type: "RSI", params: { period: 7 } },
      { type: "ADX", params: { period: 14 } },
    ],
    rules: [
      { condition: "Price near Donchian low AND RSI < 35 AND ADX < 25", action: "buy" },
      { condition: "Price near Donchian high AND RSI > 65 AND ADX < 25", action: "sell" },
    ],
    params: { donchianPeriod: 20, rsiPeriod: 7, adxPeriod: 14, nearPct: 5 },
  },

  // 40. MACD Signal Cross with Volume - Volume-confirmed MACD crosses
  {
    id: "macd_vol_cross",
    name: "MACD Volume Cross",
    indicators: [
      { type: "MACD", params: { fastPeriod: 8, slowPeriod: 21, signalPeriod: 9 } },
      { type: "VolumeSMA", params: { period: 20 } },
      { type: "EMA", params: { period: 50 } },
    ],
    rules: [
      { condition: "MACD crosses above signal AND volume > 1.2x avg AND price > EMA50", action: "buy" },
      { condition: "MACD crosses below signal AND volume > 1.2x avg AND price < EMA50", action: "sell" },
    ],
    params: { macdFast: 8, macdSlow: 21, macdSignal: 9, volumeMultiplier: 1.2 },
  },

  // 41. Stochastic MACD Combo - StochRSI + MACD dual confirmation
  {
    id: "stoch_macd_combo",
    name: "Stochastic MACD Combo",
    indicators: [
      { type: "StochRSI", params: { rsiPeriod: 14, stochPeriod: 14 } },
      { type: "MACD", params: { fastPeriod: 12, slowPeriod: 26, signalPeriod: 9 } },
    ],
    rules: [
      { condition: "StochRSI crosses above 20 AND MACD histogram > 0", action: "buy" },
      { condition: "StochRSI crosses below 80 AND MACD histogram < 0", action: "sell" },
    ],
    params: { stochOversold: 20, stochOverbought: 80 },
  },

  // 42. Aggressive Momentum Scalp - Very fast RSI + EMA for quick profits
  {
    id: "aggressive_momentum",
    name: "Aggressive Momentum Scalp",
    indicators: [
      { type: "RSI", params: { period: 5 } },
      { type: "EMA", params: { period: 5 } },
      { type: "EMA", params: { period: 10 } },
    ],
    rules: [
      { condition: "RSI > 55 AND EMA5 > EMA10", action: "buy" },
      { condition: "RSI < 45 AND EMA5 < EMA10", action: "sell" },
    ],
    params: { rsiPeriod: 5, rsiLong: 55, rsiShort: 45 },
  },

  // 43. Keltner RSI Breakout - Keltner breakout with RSI momentum
  {
    id: "keltner_rsi_breakout",
    name: "Keltner RSI Breakout",
    indicators: [
      { type: "Keltner", params: { emaPeriod: 20, atrPeriod: 10, multiplier: 2 } },
      { type: "RSI", params: { period: 14 } },
    ],
    rules: [
      { condition: "Price breaks above Keltner upper AND RSI > 50", action: "buy" },
      { condition: "Price breaks below Keltner lower AND RSI < 50", action: "sell" },
    ],
    params: { keltnerEMA: 20, keltnerATR: 10, keltnerMult: 2, rsiPeriod: 14 },
  },

  // 44. Double Bottom/Top Detection - Pattern-based reversal
  {
    id: "double_pattern",
    name: "Double Pattern Detection",
    indicators: [
      { type: "RSI", params: { period: 14 } },
      { type: "Donchian", params: { period: 10 } },
      { type: "ATR", params: { period: 14 } },
    ],
    rules: [
      { condition: "Price at recent low AND RSI divergence AND ATR low", action: "buy" },
      { condition: "Price at recent high AND RSI divergence AND ATR low", action: "sell" },
    ],
    params: { rsiPeriod: 14, donchianPeriod: 10, atrPeriod: 14 },
  },

  // ============ V5 STRATEGIES - OPTIMIZED BASED ON BACKTEST WINNERS ============
  // Built on Hull MA, CCI Momentum, RSI BB Confluence patterns

  // 45. Double Supertrend - Research shows (10,3) + (25,5) works well
  {
    id: "double_supertrend",
    name: "Double Supertrend Confirmation",
    indicators: [
      { type: "Supertrend", params: { period: 10, multiplier: 3 } },
      { type: "Supertrend", params: { period: 25, multiplier: 5 } },
    ],
    rules: [
      { condition: "Both Supertrends bullish", action: "buy" },
      { condition: "Both Supertrends bearish", action: "sell" },
    ],
    params: { fastPeriod: 10, fastMult: 3, slowPeriod: 25, slowMult: 5 },
  },

  // 46. Elder Impulse System - EMA 13 + MACD histogram direction
  {
    id: "elder_impulse",
    name: "Elder Impulse System",
    indicators: [
      { type: "EMA", params: { period: 13 } },
      { type: "MACD", params: { fastPeriod: 12, slowPeriod: 26, signalPeriod: 9 } },
    ],
    rules: [
      { condition: "EMA rising AND MACD histogram rising", action: "buy" },
      { condition: "EMA falling AND MACD histogram falling", action: "sell" },
    ],
    params: { emaPeriod: 13 },
  },

  // 47. Hull CCI Combo - Best performers combined
  {
    id: "hull_cci_combo",
    name: "Hull MA + CCI Combo",
    indicators: [
      { type: "HMA", params: { period: 16 } },
      { type: "HMA", params: { period: 21 } },
      { type: "CCI", params: { period: 14 } },
    ],
    rules: [
      { condition: "HMA16 > HMA21 AND CCI > 100", action: "buy" },
      { condition: "HMA16 < HMA21 AND CCI < -100", action: "sell" },
    ],
    params: { fastHMA: 16, slowHMA: 21, cciPeriod: 14, cciThreshold: 100 },
  },

  // 48. RSI BB Volume - Enhanced confluence with volume
  {
    id: "rsi_bb_vol",
    name: "RSI BB Volume Confluence",
    indicators: [
      { type: "RSI", params: { period: 7 } },
      { type: "Bollinger", params: { period: 15, stdDev: 2 } },
      { type: "VolumeSMA", params: { period: 20 } },
    ],
    rules: [
      { condition: "RSI < 30 AND price at lower BB AND volume > avg", action: "buy" },
      { condition: "RSI > 70 AND price at upper BB AND volume > avg", action: "sell" },
    ],
    params: { rsiPeriod: 7, bbPeriod: 15, volumeMultiplier: 1.2 },
  },

  // 49. Triple EMA Volume - 9/21/55 with volume confirmation
  {
    id: "triple_ema_vol",
    name: "Triple EMA Volume",
    indicators: [
      { type: "EMA", params: { period: 9 } },
      { type: "EMA", params: { period: 21 } },
      { type: "EMA", params: { period: 55 } },
      { type: "VolumeSMA", params: { period: 20 } },
    ],
    rules: [
      { condition: "EMA9 > EMA21 > EMA55 AND volume spike", action: "buy" },
      { condition: "EMA9 < EMA21 < EMA55 AND volume spike", action: "sell" },
    ],
    params: { volumeMultiplier: 1.3 },
  },

  // 50. ADX Momentum Breakout - Strong trends only
  {
    id: "adx_momentum_breakout",
    name: "ADX Momentum Breakout",
    indicators: [
      { type: "ADX", params: { period: 14 } },
      { type: "RSI", params: { period: 9 } },
      { type: "ATR", params: { period: 14 } },
      { type: "EMA", params: { period: 20 } },
    ],
    rules: [
      { condition: "ADX > 30 AND +DI > -DI AND RSI > 55 AND price > EMA + ATR", action: "buy" },
      { condition: "ADX > 30 AND -DI > +DI AND RSI < 45 AND price < EMA - ATR", action: "sell" },
    ],
    params: { adxThreshold: 30, rsiLong: 55, rsiShort: 45 },
  },

  // 51. Mean Reversion Plus - Enhanced BB bounce with confirmation
  {
    id: "mean_reversion_plus",
    name: "Mean Reversion Plus",
    indicators: [
      { type: "Bollinger", params: { period: 20, stdDev: 2.5 } },
      { type: "RSI", params: { period: 5 } },
      { type: "StochRSI", params: { rsiPeriod: 5, stochPeriod: 5 } },
    ],
    rules: [
      { condition: "Price below lower BB AND RSI < 20 AND StochRSI < 20", action: "buy" },
      { condition: "Price above upper BB AND RSI > 80 AND StochRSI > 80", action: "sell" },
    ],
    params: { bbPeriod: 20, bbStdDev: 2.5, rsiPeriod: 5 },
  },

  // 52. MACD Divergence Pro - MACD histogram divergence detection
  {
    id: "macd_divergence",
    name: "MACD Divergence Pro",
    indicators: [
      { type: "MACD", params: { fastPeriod: 12, slowPeriod: 26, signalPeriod: 9 } },
      { type: "EMA", params: { period: 50 } },
    ],
    rules: [
      { condition: "Price makes new low but MACD histogram makes higher low", action: "buy" },
      { condition: "Price makes new high but MACD histogram makes lower high", action: "sell" },
    ],
    params: { lookback: 10 },
  },

  // 53. Volatility Squeeze Pro - BB squeeze with momentum
  {
    id: "volatility_squeeze_pro",
    name: "Volatility Squeeze Pro",
    indicators: [
      { type: "Bollinger", params: { period: 20, stdDev: 2 } },
      { type: "Keltner", params: { emaPeriod: 20, atrPeriod: 10, multiplier: 1.5 } },
      { type: "RSI", params: { period: 14 } },
      { type: "MACD", params: { fastPeriod: 12, slowPeriod: 26, signalPeriod: 9 } },
    ],
    rules: [
      { condition: "Squeeze releases AND RSI > 50 AND MACD > signal", action: "buy" },
      { condition: "Squeeze releases AND RSI < 50 AND MACD < signal", action: "sell" },
    ],
    params: {},
  },

  // 54. Momentum Wave - Catch momentum waves with multiple confirmations
  {
    id: "momentum_wave",
    name: "Momentum Wave",
    indicators: [
      { type: "ROC", params: { period: 10 } },
      { type: "MFI", params: { period: 14 } },
      { type: "EMA", params: { period: 21 } },
    ],
    rules: [
      { condition: "ROC > 2 AND MFI > 60 AND price > EMA", action: "buy" },
      { condition: "ROC < -2 AND MFI < 40 AND price < EMA", action: "sell" },
    ],
    params: { rocThreshold: 2, mfiLong: 60, mfiShort: 40 },
  },

  // 55. Trend Strength Pro - Only strongest trends
  {
    id: "trend_strength_pro",
    name: "Trend Strength Pro",
    indicators: [
      { type: "ADX", params: { period: 14 } },
      { type: "HMA", params: { period: 9 } },
      { type: "HMA", params: { period: 21 } },
      { type: "ATR", params: { period: 14 } },
    ],
    rules: [
      { condition: "ADX > 35 AND HMA9 > HMA21 AND +DI > -DI", action: "buy" },
      { condition: "ADX > 35 AND HMA9 < HMA21 AND -DI > +DI", action: "sell" },
    ],
    params: { adxThreshold: 35, fastHMA: 9, slowHMA: 21 },
  },

  // ============ V6 STRATEGIES - BASED ON 2025 RESEARCH FINDINGS ============
  // Key insights:
  // 1. Trend following works better than mean reversion in crypto (large moves)
  // 2. MACD + RSI combo: 73% win rate backtested
  // 3. EMA 9/21 crossover: 284 trades, 2.65% avg gain on BTC
  // 4. RSI 7 for fast TF, RSI 14 for longer TF
  // 5. Volume confirmation reduces false signals by 30%

  // 56. EMA 9/21 Classic - Research-proven Bitcoin strategy (2.65% avg gain)
  {
    id: "ema_9_21_classic",
    name: "EMA 9/21 Classic",
    indicators: [
      { type: "EMA", params: { period: 9 } },
      { type: "EMA", params: { period: 21 } },
    ],
    rules: [
      { condition: "EMA9 crosses above EMA21", action: "buy" },
      { condition: "EMA9 crosses below EMA21", action: "sell" },
    ],
    params: { fastEMA: 9, slowEMA: 21 },
  },

  // 57. MACD RSI 73 - Based on 73% win rate backtested strategy
  {
    id: "macd_rsi_73",
    name: "MACD RSI 73% Win Rate",
    indicators: [
      { type: "MACD", params: { fastPeriod: 5, slowPeriod: 35, signalPeriod: 5 } },
      { type: "RSI", params: { period: 14 } },
    ],
    rules: [
      { condition: "MACD crosses above signal AND RSI < 40", action: "buy" },
      { condition: "MACD crosses below signal AND RSI > 60", action: "sell" },
    ],
    params: { macdFast: 5, macdSlow: 35, macdSignal: 5, rsiOversold: 40, rsiOverbought: 60 },
  },

  // 58. RSI Mean Reversion 20/80 - Research shows 20/80 better for crypto
  {
    id: "rsi_mean_revert_20_80",
    name: "RSI Mean Reversion 20/80",
    indicators: [
      { type: "RSI", params: { period: 14 } },
      { type: "Bollinger", params: { period: 20, stdDev: 2 } },
    ],
    rules: [
      { condition: "RSI < 20 AND price at lower BB", action: "buy" },
      { condition: "RSI > 80 AND price at upper BB", action: "sell" },
    ],
    params: { rsiPeriod: 14, rsiOversold: 20, rsiOverbought: 80 },
  },

  // 59. ATR Volatility Breakout - Trade only when volatility is favorable
  {
    id: "atr_vol_breakout",
    name: "ATR Volatility Breakout",
    indicators: [
      { type: "ATR", params: { period: 14 } },
      { type: "EMA", params: { period: 20 } },
      { type: "RSI", params: { period: 14 } },
      { type: "VolumeSMA", params: { period: 20 } },
    ],
    rules: [
      { condition: "Price breaks EMA+ATR AND volume spike AND RSI > 50", action: "buy" },
      { condition: "Price breaks EMA-ATR AND volume spike AND RSI < 50", action: "sell" },
    ],
    params: { atrPeriod: 14, emaPeriod: 20, volumeMultiplier: 1.5 },
  },

  // 60. Triple EMA 200 Filter - Only trade with major trend
  {
    id: "triple_ema_200",
    name: "Triple EMA 200 Filter",
    indicators: [
      { type: "EMA", params: { period: 9 } },
      { type: "EMA", params: { period: 21 } },
      { type: "EMA", params: { period: 200 } },
    ],
    rules: [
      { condition: "EMA9 > EMA21 AND price > EMA200", action: "buy" },
      { condition: "EMA9 < EMA21 AND price < EMA200", action: "sell" },
    ],
    params: { fastEMA: 9, midEMA: 21, slowEMA: 200 },
  },

  // 61. RSI 50 Trend Following - Research shows RSI 50 crossover is effective
  {
    id: "rsi_50_trend",
    name: "RSI 50 Trend Following",
    indicators: [
      { type: "RSI", params: { period: 14 } },
      { type: "EMA", params: { period: 50 } },
    ],
    rules: [
      { condition: "RSI crosses above 50 AND price > EMA50", action: "buy" },
      { condition: "RSI crosses below 50 AND price < EMA50", action: "sell" },
    ],
    params: { rsiPeriod: 14, emaPeriod: 50 },
  },

  // 62. Fast Scalper RSI 7 - Optimized for 5-15 min charts
  {
    id: "fast_scalper_rsi7",
    name: "Fast Scalper RSI 7",
    indicators: [
      { type: "RSI", params: { period: 7 } },
      { type: "EMA", params: { period: 5 } },
      { type: "EMA", params: { period: 13 } },
    ],
    rules: [
      { condition: "RSI > 50 AND EMA5 > EMA13", action: "buy" },
      { condition: "RSI < 50 AND EMA5 < EMA13", action: "sell" },
    ],
    params: { rsiPeriod: 7 },
  },

  // 63. Stochastic RSI MACD Combo - Triple indicator 52-73% win rate
  {
    id: "stoch_rsi_macd",
    name: "StochRSI MACD Combo",
    indicators: [
      { type: "StochRSI", params: { rsiPeriod: 14, stochPeriod: 14 } },
      { type: "MACD", params: { fastPeriod: 12, slowPeriod: 26, signalPeriod: 9 } },
      { type: "RSI", params: { period: 14 } },
    ],
    rules: [
      { condition: "StochRSI < 30 AND MACD histogram > 0 AND RSI > 40", action: "buy" },
      { condition: "StochRSI > 70 AND MACD histogram < 0 AND RSI < 60", action: "sell" },
    ],
    params: { stochOversold: 30, stochOverbought: 70 },
  },

  // 64. Volume Confirmed Breakout - 30% fewer false signals
  {
    id: "volume_confirmed_breakout",
    name: "Volume Confirmed Breakout",
    indicators: [
      { type: "Donchian", params: { period: 20 } },
      { type: "VolumeSMA", params: { period: 20 } },
      { type: "ATR", params: { period: 14 } },
    ],
    rules: [
      { condition: "Price breaks Donchian high AND volume > 1.5x avg AND ATR rising", action: "buy" },
      { condition: "Price breaks Donchian low AND volume > 1.5x avg AND ATR rising", action: "sell" },
    ],
    params: { donchianPeriod: 20, volumeMultiplier: 1.5 },
  },

  // 65. Simple MACD Signal - Clean signal crossover
  {
    id: "simple_macd_signal",
    name: "Simple MACD Signal",
    indicators: [
      { type: "MACD", params: { fastPeriod: 12, slowPeriod: 26, signalPeriod: 9 } },
      { type: "EMA", params: { period: 50 } },
    ],
    rules: [
      { condition: "MACD crosses above signal AND price > EMA50", action: "buy" },
      { condition: "MACD crosses below signal AND price < EMA50", action: "sell" },
    ],
    params: {},
  },

  // ============ V7 STRATEGIES - ITERATION 1 RESEARCH-BASED ============
  // Based on 2025 research findings:
  // 1. Fast MACD (3,10,16) - crypto-optimized for responsiveness
  // 2. Squeeze Momentum (TTM Squeeze) - BB inside Keltner detection
  // 3. Williams %R outperforms RSI in backtests
  // 4. Ichimoku 5-13-26 optimized for crypto volatility
  // 5. VWAP + EMA for intraday scalping (62%+ win rate)
  // 6. StochRSI 5-3-3 for day trading
  // Sources: mindmathmoney.com, quantifiedstrategies.com, tradingview

  // 66. Fast MACD Crypto - Optimized MACD settings for crypto (3,10,16)
  {
    id: "fast_macd_crypto",
    name: "Fast MACD Crypto",
    indicators: [
      { type: "MACD", params: { fastPeriod: 3, slowPeriod: 10, signalPeriod: 16 } },
      { type: "EMA", params: { period: 21 } },
    ],
    rules: [
      { condition: "MACD crosses above signal AND price > EMA21", action: "buy" },
      { condition: "MACD crosses below signal AND price < EMA21", action: "sell" },
    ],
    params: { macdFast: 3, macdSlow: 10, macdSignal: 16, emaPeriod: 21 },
  },

  // 67. Squeeze Momentum Fire - TTM Squeeze based strategy
  {
    id: "squeeze_momentum_fire",
    name: "Squeeze Momentum Fire",
    indicators: [
      { type: "Bollinger", params: { period: 20, stdDev: 2 } },
      { type: "Keltner", params: { emaPeriod: 20, atrPeriod: 10, multiplier: 1.5 } },
      { type: "ROC", params: { period: 10 } },
    ],
    rules: [
      { condition: "Squeeze releases (BB exits Keltner) AND ROC > 0", action: "buy" },
      { condition: "Squeeze releases (BB exits Keltner) AND ROC < 0", action: "sell" },
    ],
    params: { bbPeriod: 20, keltnerMult: 1.5, rocPeriod: 10 },
  },

  // 68. Williams %R Momentum - Outperforms RSI in backtests (CAGR 11.9% vs 7.3%)
  {
    id: "williams_r_momentum",
    name: "Williams %R Momentum",
    indicators: [
      { type: "WilliamsR", params: { period: 14 } },
      { type: "ADX", params: { period: 14 } },
      { type: "EMA", params: { period: 20 } },
    ],
    rules: [
      { condition: "Williams %R crosses above -80 AND ADX > 20 AND price > EMA", action: "buy" },
      { condition: "Williams %R crosses below -20 AND ADX > 20 AND price < EMA", action: "sell" },
    ],
    params: { period: 14, adxThreshold: 20, oversold: -80, overbought: -20 },
  },

  // 69. Ichimoku Cloud Crypto - Optimized 5-13-26 for crypto volatility
  {
    id: "ichimoku_crypto",
    name: "Ichimoku Cloud Crypto",
    indicators: [
      { type: "EMA", params: { period: 5 } },
      { type: "EMA", params: { period: 13 } },
      { type: "EMA", params: { period: 26 } },
    ],
    rules: [
      { condition: "EMA5 > EMA13 > EMA26 AND price above cloud", action: "buy" },
      { condition: "EMA5 < EMA13 < EMA26 AND price below cloud", action: "sell" },
    ],
    params: { tenkan: 5, kijun: 13, senkou: 26 },
  },

  // 70. VWAP EMA Scalper - 62%+ win rate in intraday trading
  {
    id: "vwap_ema_scalper",
    name: "VWAP EMA Scalper",
    indicators: [
      { type: "VWAP", params: {} },
      { type: "EMA", params: { period: 9 } },
      { type: "RSI", params: { period: 7 } },
    ],
    rules: [
      { condition: "Price > VWAP AND EMA9 > VWAP AND RSI > 45", action: "buy" },
      { condition: "Price < VWAP AND EMA9 < VWAP AND RSI < 55", action: "sell" },
    ],
    params: { emaPeriod: 9, rsiPeriod: 7 },
  },

  // 71. StochRSI 5-3-3 Scalper - Day trading optimized settings
  {
    id: "stochrsi_533_scalper",
    name: "StochRSI 5-3-3 Scalper",
    indicators: [
      { type: "StochRSI", params: { rsiPeriod: 5, stochPeriod: 3 } },
      { type: "EMA", params: { period: 8 } },
      { type: "EMA", params: { period: 21 } },
    ],
    rules: [
      { condition: "StochRSI crosses above 20 AND EMA8 > EMA21", action: "buy" },
      { condition: "StochRSI crosses below 80 AND EMA8 < EMA21", action: "sell" },
    ],
    params: { rsiPeriod: 5, stochPeriod: 3, oversold: 20, overbought: 80 },
  },

  // 72. ADX RSI Trend Filter - Only trade strong trends with RSI confirmation
  {
    id: "adx_rsi_trend_filter",
    name: "ADX RSI Trend Filter",
    indicators: [
      { type: "ADX", params: { period: 14 } },
      { type: "RSI", params: { period: 14 } },
      { type: "EMA", params: { period: 50 } },
    ],
    rules: [
      { condition: "ADX > 25 AND +DI > -DI AND RSI > 50 AND price > EMA50", action: "buy" },
      { condition: "ADX > 25 AND -DI > +DI AND RSI < 50 AND price < EMA50", action: "sell" },
    ],
    params: { adxThreshold: 25, rsiMidline: 50 },
  },

  // 73. Double EMA Volume - Volume confirmed EMA crossovers (30% fewer false signals)
  {
    id: "double_ema_volume",
    name: "Double EMA Volume",
    indicators: [
      { type: "EMA", params: { period: 12 } },
      { type: "EMA", params: { period: 26 } },
      { type: "VolumeSMA", params: { period: 20 } },
    ],
    rules: [
      { condition: "EMA12 crosses above EMA26 AND volume > 1.5x avg", action: "buy" },
      { condition: "EMA12 crosses below EMA26 AND volume > 1.5x avg", action: "sell" },
    ],
    params: { fastEMA: 12, slowEMA: 26, volumeMultiplier: 1.5 },
  },

  // 74. RSI BB Volume Enhanced - Best performer from V5 with tighter RSI
  {
    id: "rsi_bb_vol_enhanced",
    name: "RSI BB Volume Enhanced",
    indicators: [
      { type: "RSI", params: { period: 5 } },
      { type: "Bollinger", params: { period: 10, stdDev: 2 } },
      { type: "VolumeSMA", params: { period: 20 } },
      { type: "ADX", params: { period: 14 } },
    ],
    rules: [
      { condition: "RSI < 25 AND price at lower BB AND volume > 1.3x avg AND ADX < 30", action: "buy" },
      { condition: "RSI > 75 AND price at upper BB AND volume > 1.3x avg AND ADX < 30", action: "sell" },
    ],
    params: { rsiPeriod: 5, bbPeriod: 10, volumeMultiplier: 1.3, rsiOversold: 25, rsiOverbought: 75 },
  },

  // 75. CCI Hull Breakout - CCI + Hull MA for momentum breakouts
  {
    id: "cci_hull_breakout",
    name: "CCI Hull Breakout",
    indicators: [
      { type: "CCI", params: { period: 14 } },
      { type: "HMA", params: { period: 9 } },
      { type: "HMA", params: { period: 21 } },
      { type: "ATR", params: { period: 14 } },
    ],
    rules: [
      { condition: "CCI crosses above 100 AND HMA9 > HMA21", action: "buy" },
      { condition: "CCI crosses below -100 AND HMA9 < HMA21", action: "sell" },
    ],
    params: { cciPeriod: 14, fastHMA: 9, slowHMA: 21, cciThreshold: 100 },
  },

  // 76. Momentum ROC MFI - Triple momentum confluence
  {
    id: "momentum_roc_mfi",
    name: "Momentum ROC MFI",
    indicators: [
      { type: "ROC", params: { period: 10 } },
      { type: "MFI", params: { period: 14 } },
      { type: "Momentum", params: { period: 10 } },
      { type: "EMA", params: { period: 20 } },
    ],
    rules: [
      { condition: "ROC > 2 AND MFI > 50 AND Momentum > 0 AND price > EMA", action: "buy" },
      { condition: "ROC < -2 AND MFI < 50 AND Momentum < 0 AND price < EMA", action: "sell" },
    ],
    params: { rocThreshold: 2, mfiMidline: 50 },
  },

  // 77. Supertrend RSI Combo - Best of both worlds
  {
    id: "supertrend_rsi_combo",
    name: "Supertrend RSI Combo",
    indicators: [
      { type: "Supertrend", params: { period: 10, multiplier: 3 } },
      { type: "RSI", params: { period: 14 } },
    ],
    rules: [
      { condition: "Supertrend bullish AND RSI > 50 AND RSI < 70", action: "buy" },
      { condition: "Supertrend bearish AND RSI < 50 AND RSI > 30", action: "sell" },
    ],
    params: { period: 10, multiplier: 3, rsiPeriod: 14 },
  },

  // 78. MACD Histogram Divergence - Histogram-based divergence detection
  {
    id: "macd_hist_divergence",
    name: "MACD Histogram Divergence",
    indicators: [
      { type: "MACD", params: { fastPeriod: 12, slowPeriod: 26, signalPeriod: 9 } },
      { type: "RSI", params: { period: 14 } },
      { type: "Bollinger", params: { period: 20, stdDev: 2 } },
    ],
    rules: [
      { condition: "MACD histogram rising from negative AND RSI < 40 AND price near lower BB", action: "buy" },
      { condition: "MACD histogram falling from positive AND RSI > 60 AND price near upper BB", action: "sell" },
    ],
    params: { lookback: 5 },
  },

  // 79. Triple Timeframe Momentum - Multi-timeframe momentum alignment
  {
    id: "triple_tf_momentum",
    name: "Triple Timeframe Momentum",
    indicators: [
      { type: "EMA", params: { period: 8 } },
      { type: "EMA", params: { period: 21 } },
      { type: "EMA", params: { period: 55 } },
      { type: "RSI", params: { period: 14 } },
      { type: "ADX", params: { period: 14 } },
    ],
    rules: [
      { condition: "EMA8 > EMA21 > EMA55 AND RSI > 55 AND ADX > 20", action: "buy" },
      { condition: "EMA8 < EMA21 < EMA55 AND RSI < 45 AND ADX > 20", action: "sell" },
    ],
    params: { rsiLong: 55, rsiShort: 45, adxThreshold: 20 },
  },

  // 80. Keltner Squeeze Breakout - Enhanced squeeze detection
  {
    id: "keltner_squeeze_breakout",
    name: "Keltner Squeeze Breakout",
    indicators: [
      { type: "Keltner", params: { emaPeriod: 20, atrPeriod: 10, multiplier: 2 } },
      { type: "Bollinger", params: { period: 20, stdDev: 2 } },
      { type: "RSI", params: { period: 14 } },
      { type: "VolumeSMA", params: { period: 20 } },
    ],
    rules: [
      { condition: "BB breaks out of Keltner AND RSI > 50 AND volume spike", action: "buy" },
      { condition: "BB breaks out of Keltner AND RSI < 50 AND volume spike", action: "sell" },
    ],
    params: { keltnerMult: 2, volumeMultiplier: 1.5 },
  },

  // ============ V8 STRATEGIES - ITERATION 12 NEW INDICATORS ============
  // Based on 2025 research findings:
  // 1. Vortex Indicator - trend direction detection, works well with ADX
  // 2. Awesome Oscillator - Bill Williams momentum, best combined with RSI
  // 3. Aroon Indicator - trend strength and direction, outperforms in breakouts
  // 4. Fisher Transform - clearer reversal signals through normalization
  // 5. Ultimate Oscillator - multi-timeframe momentum (7/14/28)
  // 6. CMO (Chande Momentum) - pure momentum without smoothing
  // Sources: quantifiedstrategies.com, tradingview, avatrade

  // 81. Vortex Trend - Vortex crossover with ADX confirmation
  {
    id: "vortex_trend",
    name: "Vortex Trend Following",
    indicators: [
      { type: "VortexIndicator", params: { period: 14 } },
      { type: "ADX", params: { period: 14 } },
      { type: "EMA", params: { period: 20 } },
    ],
    rules: [
      { condition: "VI+ crosses above VI- AND ADX > 20 AND price > EMA", action: "buy" },
      { condition: "VI- crosses above VI+ AND ADX > 20 AND price < EMA", action: "sell" },
    ],
    params: { viPeriod: 14, adxThreshold: 20, emaPeriod: 20 },
  },

  // 82. Vortex Extreme - Vortex at extreme levels for high-probability trades
  {
    id: "vortex_extreme",
    name: "Vortex Extreme",
    indicators: [
      { type: "VortexIndicator", params: { period: 14 } },
      { type: "RSI", params: { period: 14 } },
    ],
    rules: [
      { condition: "VI+ > 1.1 AND VI- < 0.9 AND RSI > 50", action: "buy" },
      { condition: "VI- > 1.1 AND VI+ < 0.9 AND RSI < 50", action: "sell" },
    ],
    params: { viPeriod: 14, viOverbought: 1.1, viOversold: 0.9 },
  },

  // 83. Awesome Oscillator Zero Cross - Classic AO strategy with trend filter
  {
    id: "ao_zero_cross",
    name: "Awesome Oscillator Zero Cross",
    indicators: [
      { type: "AwesomeOscillator", params: { fastPeriod: 5, slowPeriod: 34 } },
      { type: "EMA", params: { period: 21 } },
    ],
    rules: [
      { condition: "AO crosses above zero AND price > EMA21", action: "buy" },
      { condition: "AO crosses below zero AND price < EMA21", action: "sell" },
    ],
    params: { aoFast: 5, aoSlow: 34, emaPeriod: 21 },
  },

  // 84. Awesome Oscillator Saucer - Bill Williams saucer pattern
  {
    id: "ao_saucer",
    name: "AO Saucer Pattern",
    indicators: [
      { type: "AwesomeOscillator", params: { fastPeriod: 5, slowPeriod: 34 } },
      { type: "RSI", params: { period: 14 } },
    ],
    rules: [
      { condition: "AO > 0 AND AO forms saucer pattern AND RSI > 45", action: "buy" },
      { condition: "AO < 0 AND AO forms inverted saucer AND RSI < 55", action: "sell" },
    ],
    params: { aoFast: 5, aoSlow: 34, rsiFilter: 45 },
  },

  // 85. AO RSI Combo - Awesome Oscillator with RSI confirmation
  {
    id: "ao_rsi_combo",
    name: "AO RSI Combo",
    indicators: [
      { type: "AwesomeOscillator", params: { fastPeriod: 5, slowPeriod: 34 } },
      { type: "RSI", params: { period: 14 } },
      { type: "EMA", params: { period: 50 } },
    ],
    rules: [
      { condition: "AO > 0 AND AO rising AND RSI > 50 AND price > EMA50", action: "buy" },
      { condition: "AO < 0 AND AO falling AND RSI < 50 AND price < EMA50", action: "sell" },
    ],
    params: { rsiMidline: 50 },
  },

  // 86. Aroon Crossover - Aroon up/down crossover strategy
  {
    id: "aroon_crossover",
    name: "Aroon Crossover",
    indicators: [
      { type: "AroonIndicator", params: { period: 14 } },
      { type: "EMA", params: { period: 20 } },
    ],
    rules: [
      { condition: "Aroon Up crosses above Aroon Down AND price > EMA", action: "buy" },
      { condition: "Aroon Down crosses above Aroon Up AND price < EMA", action: "sell" },
    ],
    params: { aroonPeriod: 14, emaPeriod: 20 },
  },

  // 87. Aroon Extreme - Trade when Aroon reaches extreme levels
  {
    id: "aroon_extreme",
    name: "Aroon Extreme",
    indicators: [
      { type: "AroonIndicator", params: { period: 14 } },
      { type: "RSI", params: { period: 14 } },
    ],
    rules: [
      { condition: "Aroon Up > 70 AND Aroon Down < 30 AND RSI > 50", action: "buy" },
      { condition: "Aroon Down > 70 AND Aroon Up < 30 AND RSI < 50", action: "sell" },
    ],
    params: { aroonThreshold: 70, rsiMidline: 50 },
  },

  // 88. Aroon Oscillator Breakout - Aroon oscillator for trend strength
  {
    id: "aroon_osc_breakout",
    name: "Aroon Oscillator Breakout",
    indicators: [
      { type: "AroonIndicator", params: { period: 14 } },
      { type: "ADX", params: { period: 14 } },
      { type: "ATR", params: { period: 14 } },
    ],
    rules: [
      { condition: "Aroon Oscillator > 50 AND ADX > 25", action: "buy" },
      { condition: "Aroon Oscillator < -50 AND ADX > 25", action: "sell" },
    ],
    params: { aroonPeriod: 14, oscThreshold: 50, adxThreshold: 25 },
  },

  // 89. Fisher Transform Reversal - Fisher crossover for reversals
  {
    id: "fisher_reversal",
    name: "Fisher Transform Reversal",
    indicators: [
      { type: "FisherTransform", params: { period: 10 } },
      { type: "EMA", params: { period: 21 } },
    ],
    rules: [
      { condition: "Fisher crosses above trigger AND price > EMA", action: "buy" },
      { condition: "Fisher crosses below trigger AND price < EMA", action: "sell" },
    ],
    params: { fisherPeriod: 10, emaPeriod: 21 },
  },

  // 90. Fisher Extreme - Trade Fisher at extreme levels
  {
    id: "fisher_extreme",
    name: "Fisher Transform Extreme",
    indicators: [
      { type: "FisherTransform", params: { period: 10 } },
      { type: "RSI", params: { period: 14 } },
    ],
    rules: [
      { condition: "Fisher < -1.5 AND crosses above trigger (reversal)", action: "buy" },
      { condition: "Fisher > 1.5 AND crosses below trigger (reversal)", action: "sell" },
    ],
    params: { fisherPeriod: 10, extremeLevel: 1.5 },
  },

  // 91. Ultimate Oscillator - Larry Williams' multi-timeframe momentum
  {
    id: "ultimate_osc",
    name: "Ultimate Oscillator",
    indicators: [
      { type: "UltimateOscillator", params: { period1: 7, period2: 14, period3: 28 } },
      { type: "EMA", params: { period: 20 } },
    ],
    rules: [
      { condition: "UO < 30 (oversold) AND crosses above 30 AND price > EMA", action: "buy" },
      { condition: "UO > 70 (overbought) AND crosses below 70 AND price < EMA", action: "sell" },
    ],
    params: { oversold: 30, overbought: 70 },
  },

  // 92. Ultimate Divergence - UO divergence with price
  {
    id: "ultimate_divergence",
    name: "Ultimate Oscillator Divergence",
    indicators: [
      { type: "UltimateOscillator", params: { period1: 7, period2: 14, period3: 28 } },
      { type: "Bollinger", params: { period: 20, stdDev: 2 } },
    ],
    rules: [
      { condition: "Price makes lower low but UO makes higher low (bullish div)", action: "buy" },
      { condition: "Price makes higher high but UO makes lower high (bearish div)", action: "sell" },
    ],
    params: { lookback: 10 },
  },

  // 93. CMO Momentum - Chande Momentum pure momentum strategy
  {
    id: "cmo_momentum",
    name: "CMO Momentum",
    indicators: [
      { type: "CMO", params: { period: 14 } },
      { type: "EMA", params: { period: 20 } },
    ],
    rules: [
      { condition: "CMO crosses above 0 AND price > EMA (momentum building)", action: "buy" },
      { condition: "CMO crosses below 0 AND price < EMA (momentum fading)", action: "sell" },
    ],
    params: { cmoPeriod: 14, emaPeriod: 20 },
  },

  // 94. CMO Extreme - Trade CMO at extreme levels
  {
    id: "cmo_extreme",
    name: "CMO Extreme Reversal",
    indicators: [
      { type: "CMO", params: { period: 14 } },
      { type: "RSI", params: { period: 14 } },
      { type: "Bollinger", params: { period: 20, stdDev: 2 } },
    ],
    rules: [
      { condition: "CMO < -50 AND RSI < 30 AND price at lower BB", action: "buy" },
      { condition: "CMO > 50 AND RSI > 70 AND price at upper BB", action: "sell" },
    ],
    params: { cmoExtreme: 50, rsiOversold: 30, rsiOverbought: 70 },
  },

  // 95. Vortex MACD Combo - Vortex for trend, MACD for timing
  {
    id: "vortex_macd",
    name: "Vortex MACD Combo",
    indicators: [
      { type: "VortexIndicator", params: { period: 14 } },
      { type: "MACD", params: { fastPeriod: 12, slowPeriod: 26, signalPeriod: 9 } },
    ],
    rules: [
      { condition: "VI+ > VI- AND MACD crosses above signal", action: "buy" },
      { condition: "VI- > VI+ AND MACD crosses below signal", action: "sell" },
    ],
    params: { viPeriod: 14 },
  },

  // 96. Aroon ADX Trend - Aroon direction with ADX strength
  {
    id: "aroon_adx_trend",
    name: "Aroon ADX Trend",
    indicators: [
      { type: "AroonIndicator", params: { period: 14 } },
      { type: "ADX", params: { period: 14 } },
      { type: "EMA", params: { period: 50 } },
    ],
    rules: [
      { condition: "Aroon Up > 70 AND ADX > 30 AND price > EMA50", action: "buy" },
      { condition: "Aroon Down > 70 AND ADX > 30 AND price < EMA50", action: "sell" },
    ],
    params: { aroonThreshold: 70, adxThreshold: 30 },
  },

  // 97. AO MACD Confirmation - Double momentum confirmation
  {
    id: "ao_macd_confirm",
    name: "AO MACD Confirmation",
    indicators: [
      { type: "AwesomeOscillator", params: { fastPeriod: 5, slowPeriod: 34 } },
      { type: "MACD", params: { fastPeriod: 12, slowPeriod: 26, signalPeriod: 9 } },
      { type: "ADX", params: { period: 14 } },
    ],
    rules: [
      { condition: "AO > 0 AND MACD > signal AND ADX > 20", action: "buy" },
      { condition: "AO < 0 AND MACD < signal AND ADX > 20", action: "sell" },
    ],
    params: { adxThreshold: 20 },
  },

  // 98. Triple New Indicator Combo - Vortex + Aroon + AO
  {
    id: "triple_new_combo",
    name: "Triple New Indicator Combo",
    indicators: [
      { type: "VortexIndicator", params: { period: 14 } },
      { type: "AroonIndicator", params: { period: 14 } },
      { type: "AwesomeOscillator", params: { fastPeriod: 5, slowPeriod: 34 } },
    ],
    rules: [
      { condition: "VI+ > VI- AND Aroon Up > Aroon Down AND AO > 0", action: "buy" },
      { condition: "VI- > VI+ AND Aroon Down > Aroon Up AND AO < 0", action: "sell" },
    ],
    params: {},
  },

  // 99. Fisher RSI Combo - Fisher + RSI for reversal detection
  {
    id: "fisher_rsi_combo",
    name: "Fisher RSI Combo",
    indicators: [
      { type: "FisherTransform", params: { period: 10 } },
      { type: "RSI", params: { period: 14 } },
      { type: "EMA", params: { period: 20 } },
    ],
    rules: [
      { condition: "Fisher > 0 AND RSI crosses above 50 AND price > EMA", action: "buy" },
      { condition: "Fisher < 0 AND RSI crosses below 50 AND price < EMA", action: "sell" },
    ],
    params: { fisherPeriod: 10, rsiPeriod: 14 },
  },

  // 100. Ultimate CMO Combo - Multi-timeframe momentum
  {
    id: "ultimate_cmo_combo",
    name: "Ultimate CMO Combo",
    indicators: [
      { type: "UltimateOscillator", params: { period1: 7, period2: 14, period3: 28 } },
      { type: "CMO", params: { period: 14 } },
      { type: "EMA", params: { period: 21 } },
    ],
    rules: [
      { condition: "UO > 50 AND CMO > 0 AND price > EMA", action: "buy" },
      { condition: "UO < 50 AND CMO < 0 AND price < EMA", action: "sell" },
    ],
    params: { uoMidline: 50 },
  },

  // ============ V8 RESEARCH-BASED OPTIMIZATIONS ============
  // Based on 2025 research: MACD RSI 73% win rate, Double Supertrend, Volume confirmation

  // 101. MACD RSI Optimized - 73% win rate settings with volume
  {
    id: "macd_rsi_optimized",
    name: "MACD RSI Optimized (73% WR)",
    indicators: [
      { type: "MACD", params: { fastPeriod: 5, slowPeriod: 35, signalPeriod: 5 } },
      { type: "RSI", params: { period: 14 } },
      { type: "VolumeSMA", params: { period: 20 } },
    ],
    rules: [
      { condition: "MACD crosses above signal AND RSI < 40 AND volume > avg", action: "buy" },
      { condition: "MACD crosses below signal AND RSI > 60 AND volume > avg", action: "sell" },
    ],
    params: { macdFast: 5, macdSlow: 35, macdSignal: 5, rsiLow: 40, rsiHigh: 60 },
  },

  // 102. Double Supertrend Optimized - Research-proven (7,2) + (25,5)
  {
    id: "double_supertrend_opt",
    name: "Double Supertrend Optimized",
    indicators: [
      { type: "Supertrend", params: { period: 7, multiplier: 2 } },
      { type: "Supertrend", params: { period: 25, multiplier: 5 } },
      { type: "RSI", params: { period: 14 } },
    ],
    rules: [
      { condition: "Both Supertrends bullish AND RSI > 40", action: "buy" },
      { condition: "Both Supertrends bearish AND RSI < 60", action: "sell" },
    ],
    params: { fastPeriod: 7, fastMult: 2, slowPeriod: 25, slowMult: 5 },
  },

  // 103. Supertrend Vortex - Supertrend with Vortex confirmation
  {
    id: "supertrend_vortex",
    name: "Supertrend Vortex",
    indicators: [
      { type: "Supertrend", params: { period: 10, multiplier: 3 } },
      { type: "VortexIndicator", params: { period: 14 } },
    ],
    rules: [
      { condition: "Supertrend bullish AND VI+ > VI-", action: "buy" },
      { condition: "Supertrend bearish AND VI- > VI+", action: "sell" },
    ],
    params: { stPeriod: 10, stMult: 3, viPeriod: 14 },
  },

  // 104. Aroon Volume Breakout - Aroon with volume confirmation
  {
    id: "aroon_volume",
    name: "Aroon Volume Breakout",
    indicators: [
      { type: "AroonIndicator", params: { period: 14 } },
      { type: "VolumeSMA", params: { period: 20 } },
      { type: "ATR", params: { period: 14 } },
    ],
    rules: [
      { condition: "Aroon Up reaches 100 AND volume > 1.5x avg", action: "buy" },
      { condition: "Aroon Down reaches 100 AND volume > 1.5x avg", action: "sell" },
    ],
    params: { aroonPeriod: 14, volumeMultiplier: 1.5 },
  },

  // 105. AO BB Combo - Awesome Oscillator with Bollinger Bands
  {
    id: "ao_bb_combo",
    name: "AO Bollinger Combo",
    indicators: [
      { type: "AwesomeOscillator", params: { fastPeriod: 5, slowPeriod: 34 } },
      { type: "Bollinger", params: { period: 20, stdDev: 2 } },
      { type: "RSI", params: { period: 14 } },
    ],
    rules: [
      { condition: "AO > 0 AND price crosses above middle BB AND RSI > 50", action: "buy" },
      { condition: "AO < 0 AND price crosses below middle BB AND RSI < 50", action: "sell" },
    ],
    params: { bbPeriod: 20 },
  },

  // 106. Fisher Supertrend - Fisher for reversals, Supertrend for trend
  {
    id: "fisher_supertrend",
    name: "Fisher Supertrend",
    indicators: [
      { type: "FisherTransform", params: { period: 10 } },
      { type: "Supertrend", params: { period: 10, multiplier: 3 } },
    ],
    rules: [
      { condition: "Fisher > 0 AND Supertrend flips bullish", action: "buy" },
      { condition: "Fisher < 0 AND Supertrend flips bearish", action: "sell" },
    ],
    params: { fisherPeriod: 10, stPeriod: 10, stMult: 3 },
  },

  // 107. CMO ADX Trend - CMO momentum with ADX strength
  {
    id: "cmo_adx_trend",
    name: "CMO ADX Trend",
    indicators: [
      { type: "CMO", params: { period: 14 } },
      { type: "ADX", params: { period: 14 } },
      { type: "EMA", params: { period: 20 } },
    ],
    rules: [
      { condition: "CMO > 20 AND ADX > 25 AND price > EMA", action: "buy" },
      { condition: "CMO < -20 AND ADX > 25 AND price < EMA", action: "sell" },
    ],
    params: { cmoThreshold: 20, adxThreshold: 25 },
  },

  // 108. UO Aroon Combo - Ultimate Oscillator with Aroon direction
  {
    id: "uo_aroon_combo",
    name: "UO Aroon Combo",
    indicators: [
      { type: "UltimateOscillator", params: { period1: 7, period2: 14, period3: 28 } },
      { type: "AroonIndicator", params: { period: 14 } },
    ],
    rules: [
      { condition: "UO crosses above 50 AND Aroon Up > Aroon Down", action: "buy" },
      { condition: "UO crosses below 50 AND Aroon Down > Aroon Up", action: "sell" },
    ],
    params: { uoMidline: 50 },
  },

  // 109. Vortex EMA Ribbon - Vortex with EMA ribbon confirmation
  {
    id: "vortex_ema_ribbon",
    name: "Vortex EMA Ribbon",
    indicators: [
      { type: "VortexIndicator", params: { period: 14 } },
      { type: "EMA", params: { period: 8 } },
      { type: "EMA", params: { period: 13 } },
      { type: "EMA", params: { period: 21 } },
    ],
    rules: [
      { condition: "VI+ > VI- AND EMA8 > EMA13 > EMA21", action: "buy" },
      { condition: "VI- > VI+ AND EMA8 < EMA13 < EMA21", action: "sell" },
    ],
    params: { viPeriod: 14 },
  },

  // 110. AO Fisher Reversal - Momentum + reversal detection
  {
    id: "ao_fisher_reversal",
    name: "AO Fisher Reversal",
    indicators: [
      { type: "AwesomeOscillator", params: { fastPeriod: 5, slowPeriod: 34 } },
      { type: "FisherTransform", params: { period: 10 } },
      { type: "RSI", params: { period: 14 } },
    ],
    rules: [
      { condition: "AO crosses above 0 AND Fisher > 0 AND RSI > 50", action: "buy" },
      { condition: "AO crosses below 0 AND Fisher < 0 AND RSI < 50", action: "sell" },
    ],
    params: {},
  },

  // ============ V9 STRATEGIES - ITERATION 23 ============
  // Based on 2025 research: Multi-factor momentum, STC, Elder Force, TSI
  // Research sources:
  // - QuantifiedStrategies: 73% win rate MACD+RSI combo
  // - Multi-factor momentum crossover with volume confirmation
  // - Schaff Trend Cycle for faster MACD signals
  // - Elder Force Index for volume-price momentum

  // 111. Schaff Trend Cycle Crossover - Faster than MACD
  {
    id: "stc_crossover",
    name: "Schaff Trend Cycle Crossover",
    indicators: [
      { type: "SchaffTrendCycle", params: { fastPeriod: 23, slowPeriod: 50, cyclePeriod: 10 } },
      { type: "EMA", params: { period: 20 } },
    ],
    rules: [
      { condition: "STC crosses above 25 AND price > EMA20", action: "buy" },
      { condition: "STC crosses below 75 AND price < EMA20", action: "sell" },
    ],
    params: { stcLow: 25, stcHigh: 75, emaPeriod: 20 },
  },

  // 112. STC + MACD Confirmation - Double momentum filter
  {
    id: "stc_macd_confirm",
    name: "STC MACD Confirmation",
    indicators: [
      { type: "SchaffTrendCycle", params: { fastPeriod: 23, slowPeriod: 50, cyclePeriod: 10 } },
      { type: "MACD", params: { fastPeriod: 12, slowPeriod: 26, signalPeriod: 9 } },
    ],
    rules: [
      { condition: "STC > 25 rising AND MACD > signal", action: "buy" },
      { condition: "STC < 75 falling AND MACD < signal", action: "sell" },
    ],
    params: { stcLow: 25, stcHigh: 75 },
  },

  // 113. STC Crypto Fast - Optimized STC for crypto volatility
  {
    id: "stc_crypto_fast",
    name: "STC Crypto Fast",
    indicators: [
      { type: "SchaffTrendCycle", params: { fastPeriod: 10, slowPeriod: 21, cyclePeriod: 5 } },
      { type: "RSI", params: { period: 7 } },
    ],
    rules: [
      { condition: "STC crosses above 20 AND RSI > 45", action: "buy" },
      { condition: "STC crosses below 80 AND RSI < 55", action: "sell" },
    ],
    params: { stcLow: 20, stcHigh: 80 },
  },

  // 114. Elder Force Index Trend - Volume-momentum confirmation
  {
    id: "efi_trend",
    name: "Elder Force Index Trend",
    indicators: [
      { type: "ElderForceIndex", params: { period: 13 } },
      { type: "EMA", params: { period: 22 } },
    ],
    rules: [
      { condition: "EFI crosses above 0 AND price > EMA22", action: "buy" },
      { condition: "EFI crosses below 0 AND price < EMA22", action: "sell" },
    ],
    params: { efiPeriod: 13, emaPeriod: 22 },
  },

  // 115. EFI 2-Day Pullback - Elder's recommended for corrections
  {
    id: "efi_pullback",
    name: "EFI 2-Day Pullback",
    indicators: [
      { type: "ElderForceIndex", params: { period: 2 } },
      { type: "EMA", params: { period: 22 } },
      { type: "ADX", params: { period: 14 } },
    ],
    rules: [
      { condition: "EFI dips negative in uptrend AND ADX > 20", action: "buy" },
      { condition: "EFI spikes positive in downtrend AND ADX > 20", action: "sell" },
    ],
    params: { efiPeriod: 2, emaPeriod: 22, adxThreshold: 20 },
  },

  // 116. TSI Momentum - True Strength Index crossover
  {
    id: "tsi_momentum",
    name: "TSI Momentum",
    indicators: [
      { type: "TrueStrengthIndex", params: { longPeriod: 25, shortPeriod: 13, signalPeriod: 7 } },
      { type: "EMA", params: { period: 50 } },
    ],
    rules: [
      { condition: "TSI crosses above signal AND price > EMA50", action: "buy" },
      { condition: "TSI crosses below signal AND price < EMA50", action: "sell" },
    ],
    params: { tsiLong: 25, tsiShort: 13, tsiSignal: 7 },
  },

  // 117. TSI Zero Cross - TSI zero line crossover
  {
    id: "tsi_zero_cross",
    name: "TSI Zero Cross",
    indicators: [
      { type: "TrueStrengthIndex", params: { longPeriod: 25, shortPeriod: 13, signalPeriod: 7 } },
      { type: "ADX", params: { period: 14 } },
    ],
    rules: [
      { condition: "TSI crosses above 0 AND ADX > 20", action: "buy" },
      { condition: "TSI crosses below 0 AND ADX > 20", action: "sell" },
    ],
    params: { adxThreshold: 20 },
  },

  // 118. KST Momentum - Know Sure Thing trend detection
  {
    id: "kst_momentum",
    name: "KST Momentum",
    indicators: [
      { type: "KnowSureThing", params: {} },
      { type: "EMA", params: { period: 20 } },
    ],
    rules: [
      { condition: "KST crosses above signal AND price > EMA20", action: "buy" },
      { condition: "KST crosses below signal AND price < EMA20", action: "sell" },
    ],
    params: {},
  },

  // 119. Connors RSI Extreme - Mean reversion with CRSI
  {
    id: "crsi_extreme",
    name: "Connors RSI Extreme",
    indicators: [
      { type: "ConnorsRSI", params: { rsiPeriod: 3, streakPeriod: 2, rocPeriod: 100 } },
      { type: "ADX", params: { period: 14 } },
    ],
    rules: [
      { condition: "CRSI < 10 AND ADX < 25", action: "buy" },
      { condition: "CRSI > 90 AND ADX < 25", action: "sell" },
    ],
    params: { crsiLow: 10, crsiHigh: 90, adxThreshold: 25 },
  },

  // 120. PPO Momentum - Normalized MACD
  {
    id: "ppo_momentum",
    name: "PPO Momentum",
    indicators: [
      { type: "PPO", params: { fastPeriod: 12, slowPeriod: 26, signalPeriod: 9 } },
      { type: "VolumeSMA", params: { period: 20 } },
    ],
    rules: [
      { condition: "PPO crosses above signal AND volume > avg", action: "buy" },
      { condition: "PPO crosses below signal AND volume > avg", action: "sell" },
    ],
    params: { volumeMultiplier: 1.2 },
  },

  // 121. Multi-Factor Momentum V9 - Full confluence
  {
    id: "multi_factor_v9",
    name: "Multi-Factor Momentum V9",
    indicators: [
      { type: "RSI", params: { period: 14 } },
      { type: "MACD", params: { fastPeriod: 12, slowPeriod: 26, signalPeriod: 9 } },
      { type: "EMA", params: { period: 50 } },
      { type: "VolumeSMA", params: { period: 20 } },
    ],
    rules: [
      { condition: "RSI > 50 AND MACD > signal AND price > EMA50 AND volume > 1.5x avg", action: "buy" },
      { condition: "RSI < 50 AND MACD < signal AND price < EMA50 AND volume > 1.5x avg", action: "sell" },
    ],
    params: { volumeMultiplier: 1.5 },
  },

  // 122. STC + TSI Combo - Double smoothed momentum
  {
    id: "stc_tsi_combo",
    name: "STC TSI Combo",
    indicators: [
      { type: "SchaffTrendCycle", params: { fastPeriod: 23, slowPeriod: 50, cyclePeriod: 10 } },
      { type: "TrueStrengthIndex", params: { longPeriod: 25, shortPeriod: 13, signalPeriod: 7 } },
    ],
    rules: [
      { condition: "STC > 50 rising AND TSI > signal", action: "buy" },
      { condition: "STC < 50 falling AND TSI < signal", action: "sell" },
    ],
    params: {},
  },

  // 123. MACD RSI 73 Enhanced - Based on 73% win rate research + volume
  {
    id: "macd_rsi_73_vol",
    name: "MACD RSI 73% + Volume",
    indicators: [
      { type: "MACD", params: { fastPeriod: 5, slowPeriod: 35, signalPeriod: 5 } },
      { type: "RSI", params: { period: 14 } },
      { type: "VolumeSMA", params: { period: 20 } },
      { type: "EMA", params: { period: 50 } },
    ],
    rules: [
      { condition: "MACD crosses above signal AND RSI < 40 AND volume > avg AND price > EMA50", action: "buy" },
      { condition: "MACD crosses below signal AND RSI > 60 AND volume > avg AND price < EMA50", action: "sell" },
    ],
    params: { rsiOversold: 40, rsiOverbought: 60, volumeMultiplier: 1.0 },
  },

  // 124. Supertrend + STC - Trend + momentum
  {
    id: "supertrend_stc",
    name: "Supertrend STC",
    indicators: [
      { type: "Supertrend", params: { period: 10, multiplier: 3 } },
      { type: "SchaffTrendCycle", params: { fastPeriod: 23, slowPeriod: 50, cyclePeriod: 10 } },
    ],
    rules: [
      { condition: "Supertrend bullish AND STC > 25 rising", action: "buy" },
      { condition: "Supertrend bearish AND STC < 75 falling", action: "sell" },
    ],
    params: {},
  },

  // 125. Hull + EFI Combo - Fast trend + volume confirmation
  {
    id: "hull_efi_combo",
    name: "Hull EFI Combo",
    indicators: [
      { type: "HMA", params: { period: 9 } },
      { type: "HMA", params: { period: 21 } },
      { type: "ElderForceIndex", params: { period: 13 } },
    ],
    rules: [
      { condition: "HMA9 > HMA21 AND EFI > 0", action: "buy" },
      { condition: "HMA9 < HMA21 AND EFI < 0", action: "sell" },
    ],
    params: { fastHMA: 9, slowHMA: 21 },
  },

  // 126. Keltner + TSI Breakout - Volatility + momentum
  {
    id: "keltner_tsi_breakout",
    name: "Keltner TSI Breakout",
    indicators: [
      { type: "Keltner", params: { emaPeriod: 20, atrPeriod: 10, multiplier: 2 } },
      { type: "TrueStrengthIndex", params: { longPeriod: 25, shortPeriod: 13, signalPeriod: 7 } },
    ],
    rules: [
      { condition: "Price breaks above Keltner upper AND TSI > 0", action: "buy" },
      { condition: "Price breaks below Keltner lower AND TSI < 0", action: "sell" },
    ],
    params: {},
  },

  // 127. ADX + KST Trend - Strong trend with multi-timeframe momentum
  {
    id: "adx_kst_trend",
    name: "ADX KST Trend",
    indicators: [
      { type: "ADX", params: { period: 14 } },
      { type: "KnowSureThing", params: {} },
    ],
    rules: [
      { condition: "ADX > 25 AND +DI > -DI AND KST > signal", action: "buy" },
      { condition: "ADX > 25 AND -DI > +DI AND KST < signal", action: "sell" },
    ],
    params: { adxThreshold: 25 },
  },

  // 128. Donchian + EFI Breakout - Channel breakout with volume force
  {
    id: "donchian_efi_breakout",
    name: "Donchian EFI Breakout",
    indicators: [
      { type: "Donchian", params: { period: 20 } },
      { type: "ElderForceIndex", params: { period: 13 } },
      { type: "ADX", params: { period: 14 } },
    ],
    rules: [
      { condition: "Price breaks Donchian high AND EFI > 0 AND ADX > 20", action: "buy" },
      { condition: "Price breaks Donchian low AND EFI < 0 AND ADX > 20", action: "sell" },
    ],
    params: { donchianPeriod: 20, adxThreshold: 20 },
  },

  // 129. Aroon + TSI Trend - Trend direction + momentum strength
  {
    id: "aroon_tsi_trend",
    name: "Aroon TSI Trend",
    indicators: [
      { type: "AroonIndicator", params: { period: 14 } },
      { type: "TrueStrengthIndex", params: { longPeriod: 25, shortPeriod: 13, signalPeriod: 7 } },
    ],
    rules: [
      { condition: "Aroon Up > 70 AND Aroon Osc > 50 AND TSI > 0", action: "buy" },
      { condition: "Aroon Down > 70 AND Aroon Osc < -50 AND TSI < 0", action: "sell" },
    ],
    params: { aroonThreshold: 70 },
  },

  // 130. Triple Momentum V9 - RSI + TSI + STC alignment
  {
    id: "triple_momentum_v9",
    name: "Triple Momentum V9",
    indicators: [
      { type: "RSI", params: { period: 14 } },
      { type: "TrueStrengthIndex", params: { longPeriod: 25, shortPeriod: 13, signalPeriod: 7 } },
      { type: "SchaffTrendCycle", params: { fastPeriod: 23, slowPeriod: 50, cyclePeriod: 10 } },
    ],
    rules: [
      { condition: "RSI > 55 AND TSI > 0 AND STC > 60", action: "buy" },
      { condition: "RSI < 45 AND TSI < 0 AND STC < 40", action: "sell" },
    ],
    params: { rsiLong: 55, rsiShort: 45 },
  },

  // ============ V10 STRATEGIES - ITERATION 51 ============
  // Based on top performer analysis: ADX+KST (85.7% WR), momentum_burst (91% PnL)
  // Focus: Multi-factor confluence, volume confirmation, adaptive parameters

  // 131. Enhanced ADX KST Pro - Optimized version of top performer
  {
    id: "adx_kst_pro",
    name: "ADX KST Pro",
    indicators: [
      { type: "ADX", params: { period: 14 } },
      { type: "KnowSureThing", params: {} },
      { type: "EMA", params: { period: 21 } },
    ],
    rules: [
      { condition: "ADX > 25 AND +DI > -DI AND KST > signal AND KST rising AND price > EMA21", action: "buy" },
      { condition: "ADX > 25 AND -DI > +DI AND KST < signal AND KST falling AND price < EMA21", action: "sell" },
    ],
    params: { adxThreshold: 25, emaPeriod: 21 },
  },

  // 132. Quad Momentum Confluence - RSI + MACD + ADX + KST (85% signal alignment)
  {
    id: "quad_momentum",
    name: "Quad Momentum Confluence",
    indicators: [
      { type: "RSI", params: { period: 14 } },
      { type: "MACD", params: { fastPeriod: 12, slowPeriod: 26, signalPeriod: 9 } },
      { type: "ADX", params: { period: 14 } },
      { type: "KnowSureThing", params: {} },
    ],
    rules: [
      { condition: "RSI > 55 AND MACD > signal AND ADX > 25 AND KST > KST_signal", action: "buy" },
      { condition: "RSI < 45 AND MACD < signal AND ADX > 25 AND KST < KST_signal", action: "sell" },
    ],
    params: { rsiLong: 55, rsiShort: 45, adxThreshold: 25 },
  },

  // 133. Momentum Burst Volume - Enhanced momentum_burst with volume filter
  {
    id: "momentum_burst_vol",
    name: "Momentum Burst Volume",
    indicators: [
      { type: "RSI", params: { period: 7 } },
      { type: "ADX", params: { period: 10 } },
      { type: "EMA", params: { period: 10 } },
      { type: "VolumeSMA", params: { period: 20 } },
    ],
    rules: [
      { condition: "RSI > 60 AND ADX > 30 AND price > EMA10 AND volume > 1.2x avg", action: "buy" },
      { condition: "RSI < 40 AND ADX > 30 AND price < EMA10 AND volume > 1.2x avg", action: "sell" },
    ],
    params: { rsiLong: 60, rsiShort: 40, adxThreshold: 30, volumeMultiplier: 1.2 },
  },

  // 134. RSI ADX Surge Pro - Enhanced momentum_surge
  {
    id: "rsi_adx_surge_pro",
    name: "RSI ADX Surge Pro",
    indicators: [
      { type: "RSI", params: { period: 9 } },
      { type: "ADX", params: { period: 14 } },
      { type: "EMA", params: { period: 13 } },
      { type: "EMA", params: { period: 34 } },
    ],
    rules: [
      { condition: "RSI > 55 AND ADX > 25 AND EMA13 > EMA34 AND price > EMA13", action: "buy" },
      { condition: "RSI < 45 AND ADX > 25 AND EMA13 < EMA34 AND price < EMA13", action: "sell" },
    ],
    params: { rsiLong: 55, rsiShort: 45, adxThreshold: 25, fastEMA: 13, slowEMA: 34 },
  },

  // 135. TSI KST Confluence - Double multi-timeframe momentum
  {
    id: "tsi_kst_confluence",
    name: "TSI KST Confluence",
    indicators: [
      { type: "TrueStrengthIndex", params: { longPeriod: 25, shortPeriod: 13, signalPeriod: 7 } },
      { type: "KnowSureThing", params: {} },
      { type: "ADX", params: { period: 14 } },
    ],
    rules: [
      { condition: "TSI > 0 AND TSI > signal AND KST > KST_signal AND ADX > 20", action: "buy" },
      { condition: "TSI < 0 AND TSI < signal AND KST < KST_signal AND ADX > 20", action: "sell" },
    ],
    params: { adxThreshold: 20 },
  },

  // 136. EFI RSI Momentum - Volume force + momentum
  {
    id: "efi_rsi_momentum",
    name: "EFI RSI Momentum",
    indicators: [
      { type: "ElderForceIndex", params: { period: 13 } },
      { type: "RSI", params: { period: 9 } },
      { type: "EMA", params: { period: 21 } },
    ],
    rules: [
      { condition: "EFI > 0 AND EFI rising AND RSI > 55 AND price > EMA21", action: "buy" },
      { condition: "EFI < 0 AND EFI falling AND RSI < 45 AND price < EMA21", action: "sell" },
    ],
    params: { rsiLong: 55, rsiShort: 45 },
  },

  // 137. Supertrend ADX Volume - Trend + strength + volume
  {
    id: "supertrend_adx_vol",
    name: "Supertrend ADX Volume",
    indicators: [
      { type: "Supertrend", params: { period: 10, multiplier: 3 } },
      { type: "ADX", params: { period: 14 } },
      { type: "VolumeSMA", params: { period: 20 } },
    ],
    rules: [
      { condition: "Supertrend bullish AND ADX > 25 AND volume > 1.3x avg", action: "buy" },
      { condition: "Supertrend bearish AND ADX > 25 AND volume > 1.3x avg", action: "sell" },
    ],
    params: { adxThreshold: 25, volumeMultiplier: 1.3 },
  },

  // 138. Fast Momentum Scalp Pro - Ultra fast momentum with filters
  {
    id: "fast_momentum_scalp",
    name: "Fast Momentum Scalp Pro",
    indicators: [
      { type: "RSI", params: { period: 5 } },
      { type: "EMA", params: { period: 5 } },
      { type: "EMA", params: { period: 13 } },
      { type: "ADX", params: { period: 10 } },
    ],
    rules: [
      { condition: "RSI > 55 AND EMA5 > EMA13 AND ADX > 20", action: "buy" },
      { condition: "RSI < 45 AND EMA5 < EMA13 AND ADX > 20", action: "sell" },
    ],
    params: { rsiLong: 55, rsiShort: 45, adxThreshold: 20 },
  },

  // 139. Breakout Momentum Pro - Donchian + momentum confluence
  {
    id: "breakout_momentum_pro",
    name: "Breakout Momentum Pro",
    indicators: [
      { type: "Donchian", params: { period: 15 } },
      { type: "RSI", params: { period: 14 } },
      { type: "ADX", params: { period: 14 } },
    ],
    rules: [
      { condition: "Price breaks Donchian high AND RSI > 50 AND ADX > 25", action: "buy" },
      { condition: "Price breaks Donchian low AND RSI < 50 AND ADX > 25", action: "sell" },
    ],
    params: { donchianPeriod: 15, adxThreshold: 25 },
  },

  // 140. STC ADX Trend - Schaff + ADX for fast trend detection
  {
    id: "stc_adx_trend",
    name: "STC ADX Trend",
    indicators: [
      { type: "SchaffTrendCycle", params: { fastPeriod: 10, slowPeriod: 21, cyclePeriod: 5 } },
      { type: "ADX", params: { period: 14 } },
      { type: "EMA", params: { period: 21 } },
    ],
    rules: [
      { condition: "STC crosses above 25 AND STC rising AND ADX > 20 AND price > EMA21", action: "buy" },
      { condition: "STC crosses below 75 AND STC falling AND ADX > 20 AND price < EMA21", action: "sell" },
    ],
    params: { stcLow: 25, stcHigh: 75, adxThreshold: 20 },
  },

  // ============ V11 STRATEGIES - ITERATION 67 ============
  // Based on 2025 research: Ichimoku Cloud, VWAP Bands, Market Structure BOS/CHoCH
  // Focus: Multi-indicator confluence (85% signal alignment), Smart Money Concepts

  // 141. Ichimoku Cloud Breakout - Classic kumo breakout strategy
  {
    id: "ichimoku_cloud_breakout",
    name: "Ichimoku Cloud Breakout",
    indicators: [
      { type: "IchimokuCloud", params: { tenkanPeriod: 9, kijunPeriod: 26, senkouBPeriod: 52, displacement: 26 } },
      { type: "ADX", params: { period: 14 } },
    ],
    rules: [
      { condition: "Price breaks above cloud AND ADX > 20", action: "buy" },
      { condition: "Price breaks below cloud AND ADX > 20", action: "sell" },
    ],
    params: { adxThreshold: 20 },
  },

  // 142. Ichimoku TK Cross - Tenkan-Kijun crossover with cloud filter
  {
    id: "ichimoku_tk_cross",
    name: "Ichimoku TK Cross",
    indicators: [
      { type: "IchimokuCloud", params: { tenkanPeriod: 9, kijunPeriod: 26, senkouBPeriod: 52, displacement: 26 } },
    ],
    rules: [
      { condition: "Tenkan crosses above Kijun AND price above cloud AND cloud bullish", action: "buy" },
      { condition: "Tenkan crosses below Kijun AND price below cloud AND cloud bearish", action: "sell" },
    ],
    params: {},
  },

  // 143. Ichimoku Crypto Settings - Optimized for 24/7 crypto markets
  {
    id: "ichimoku_crypto",
    name: "Ichimoku Crypto Optimized",
    indicators: [
      { type: "IchimokuCloud", params: { tenkanPeriod: 5, kijunPeriod: 13, senkouBPeriod: 26, displacement: 13 } },
      { type: "RSI", params: { period: 14 } },
    ],
    rules: [
      { condition: "Price above cloud AND Tenkan > Kijun AND RSI > 50", action: "buy" },
      { condition: "Price below cloud AND Tenkan < Kijun AND RSI < 50", action: "sell" },
    ],
    params: {},
  },

  // 144. VWAP Bands Mean Reversion - Trade bounces from VWAP deviation bands
  {
    id: "vwap_bands_reversion",
    name: "VWAP Bands Mean Reversion",
    indicators: [
      { type: "VWAPBands", params: {} },
      { type: "RSI", params: { period: 7 } },
    ],
    rules: [
      { condition: "Price touches lower band 2 AND RSI < 30", action: "buy" },
      { condition: "Price touches upper band 2 AND RSI > 70", action: "sell" },
    ],
    params: {},
  },

  // 145. VWAP Bands Momentum - Trade breakouts beyond VWAP bands
  {
    id: "vwap_bands_momentum",
    name: "VWAP Bands Momentum",
    indicators: [
      { type: "VWAPBands", params: {} },
      { type: "ADX", params: { period: 14 } },
      { type: "VolumeSMA", params: { period: 20 } },
    ],
    rules: [
      { condition: "Price breaks above upper band 2 AND ADX > 25 AND volume > 1.5x avg", action: "buy" },
      { condition: "Price breaks below lower band 2 AND ADX > 25 AND volume > 1.5x avg", action: "sell" },
    ],
    params: { adxThreshold: 25, volumeMultiplier: 1.5 },
  },

  // 146. Rolling VWAP Trend - Continuous VWAP for 24/7 crypto
  {
    id: "rolling_vwap_trend",
    name: "Rolling VWAP Trend",
    indicators: [
      { type: "RollingVWAP", params: { period: 21 } },
      { type: "EMA", params: { period: 9 } },
      { type: "ADX", params: { period: 14 } },
    ],
    rules: [
      { condition: "EMA9 crosses above RVWAP AND price > RVWAP AND ADX > 20", action: "buy" },
      { condition: "EMA9 crosses below RVWAP AND price < RVWAP AND ADX > 20", action: "sell" },
    ],
    params: { adxThreshold: 20 },
  },

  // 147. Market Structure BOS - Trade break of structure continuations
  {
    id: "market_structure_bos",
    name: "Market Structure BOS",
    indicators: [
      { type: "MarketStructure", params: { swingLookback: 5 } },
      { type: "RSI", params: { period: 14 } },
    ],
    rules: [
      { condition: "Bullish BOS AND trend is up AND RSI > 50", action: "buy" },
      { condition: "Bearish BOS AND trend is down AND RSI < 50", action: "sell" },
    ],
    params: {},
  },

  // 148. Market Structure CHoCH Reversal - Trade change of character reversals
  {
    id: "market_structure_choch",
    name: "Market Structure CHoCH",
    indicators: [
      { type: "MarketStructure", params: { swingLookback: 5 } },
      { type: "RSI", params: { period: 9 } },
      { type: "VolumeSMA", params: { period: 20 } },
    ],
    rules: [
      { condition: "Bullish CHoCH AND RSI crossing above 50 AND volume spike", action: "buy" },
      { condition: "Bearish CHoCH AND RSI crossing below 50 AND volume spike", action: "sell" },
    ],
    params: { volumeMultiplier: 1.5 },
  },

  // 149. Squeeze Momentum Breakout - TTM Squeeze-style volatility expansion
  {
    id: "squeeze_momentum_breakout",
    name: "Squeeze Momentum Breakout",
    indicators: [
      { type: "SqueezeMomentum", params: { bbPeriod: 20, bbMult: 2, kcPeriod: 20, kcMult: 1.5 } },
      { type: "EMA", params: { period: 21 } },
    ],
    rules: [
      { condition: "Exit squeeze AND momentum > 0 AND momentum rising AND price > EMA21", action: "buy" },
      { condition: "Exit squeeze AND momentum < 0 AND momentum falling AND price < EMA21", action: "sell" },
    ],
    params: {},
  },

  // 150. Multi-Factor Confluence V11 - 4-indicator alignment (85% methodology)
  {
    id: "multi_factor_v11",
    name: "Multi-Factor Confluence V11",
    indicators: [
      { type: "RSI", params: { period: 14 } },
      { type: "MACD", params: { fastPeriod: 12, slowPeriod: 26, signalPeriod: 9 } },
      { type: "ADX", params: { period: 14 } },
      { type: "SchaffTrendCycle", params: { fastPeriod: 23, slowPeriod: 50, cyclePeriod: 10 } },
    ],
    rules: [
      { condition: "RSI > 55 AND MACD > signal AND ADX > 25 AND STC > 60", action: "buy" },
      { condition: "RSI < 45 AND MACD < signal AND ADX > 25 AND STC < 40", action: "sell" },
    ],
    params: { rsiLong: 55, rsiShort: 45, adxThreshold: 25 },
  },

  // 151. Ichimoku VWAP Combo - Cloud trend + VWAP support
  {
    id: "ichimoku_vwap_combo",
    name: "Ichimoku VWAP Combo",
    indicators: [
      { type: "IchimokuCloud", params: { tenkanPeriod: 9, kijunPeriod: 26, senkouBPeriod: 52, displacement: 26 } },
      { type: "VWAP", params: {} },
      { type: "RSI", params: { period: 14 } },
    ],
    rules: [
      { condition: "Price above cloud AND price above VWAP AND RSI > 50", action: "buy" },
      { condition: "Price below cloud AND price below VWAP AND RSI < 50", action: "sell" },
    ],
    params: {},
  },

  // 152. Trend Intensity Momentum - TII-based trend confirmation
  {
    id: "trend_intensity_momentum",
    name: "Trend Intensity Momentum",
    indicators: [
      { type: "TrendIntensityIndex", params: { period: 14 } },
      { type: "RSI", params: { period: 9 } },
      { type: "EMA", params: { period: 21 } },
    ],
    rules: [
      { condition: "TII > 60 AND RSI > 55 AND price > EMA21", action: "buy" },
      { condition: "TII < 40 AND RSI < 45 AND price < EMA21", action: "sell" },
    ],
    params: {},
  },

  // 153. Price Momentum Score - Combined momentum indicator
  {
    id: "price_momentum_score",
    name: "Price Momentum Score",
    indicators: [
      { type: "PriceMomentumScore", params: { period: 14 } },
      { type: "ADX", params: { period: 14 } },
      { type: "VolumeSMA", params: { period: 20 } },
    ],
    rules: [
      { condition: "PMS > 65 AND ADX > 25 AND volume > avg", action: "buy" },
      { condition: "PMS < 35 AND ADX > 25 AND volume > avg", action: "sell" },
    ],
    params: { adxThreshold: 25 },
  },

  // 154. Smart Money Structure - BOS + EFI (volume force behind moves)
  {
    id: "smart_money_structure",
    name: "Smart Money Structure",
    indicators: [
      { type: "MarketStructure", params: { swingLookback: 5 } },
      { type: "ElderForceIndex", params: { period: 13 } },
      { type: "ADX", params: { period: 14 } },
    ],
    rules: [
      { condition: "Bullish BOS AND EFI > 0 AND ADX > 20", action: "buy" },
      { condition: "Bearish BOS AND EFI < 0 AND ADX > 20", action: "sell" },
    ],
    params: { adxThreshold: 20 },
  },

  // 155. Accumulation Distribution Trend - AD line + price trend
  {
    id: "ad_trend",
    name: "Accumulation Distribution Trend",
    indicators: [
      { type: "AccumulationDistribution", params: {} },
      { type: "EMA", params: { period: 21 } },
      { type: "RSI", params: { period: 14 } },
    ],
    rules: [
      { condition: "AD rising AND price > EMA21 AND RSI > 50", action: "buy" },
      { condition: "AD falling AND price < EMA21 AND RSI < 50", action: "sell" },
    ],
    params: {},
  },

  // 156. Ichimoku RSI BB - Full confluence with Ichimoku
  {
    id: "ichimoku_rsi_bb",
    name: "Ichimoku RSI BB Confluence",
    indicators: [
      { type: "IchimokuCloud", params: { tenkanPeriod: 9, kijunPeriod: 26, senkouBPeriod: 52, displacement: 26 } },
      { type: "RSI", params: { period: 14 } },
      { type: "Bollinger", params: { period: 20, stdDev: 2 } },
    ],
    rules: [
      { condition: "Price above cloud AND RSI > 50 AND price near lower BB", action: "buy" },
      { condition: "Price below cloud AND RSI < 50 AND price near upper BB", action: "sell" },
    ],
    params: {},
  },

  // 157. VWAP ADX Momentum - VWAP trend + ADX strength
  {
    id: "vwap_adx_momentum",
    name: "VWAP ADX Momentum",
    indicators: [
      { type: "VWAP", params: {} },
      { type: "ADX", params: { period: 14 } },
      { type: "RSI", params: { period: 9 } },
    ],
    rules: [
      { condition: "Price crosses above VWAP AND ADX > 25 AND RSI > 55", action: "buy" },
      { condition: "Price crosses below VWAP AND ADX > 25 AND RSI < 45", action: "sell" },
    ],
    params: { adxThreshold: 25, rsiLong: 55, rsiShort: 45 },
  },

  // 158. Squeeze TSI Combo - Volatility squeeze + TSI momentum
  {
    id: "squeeze_tsi_combo",
    name: "Squeeze TSI Combo",
    indicators: [
      { type: "SqueezeMomentum", params: { bbPeriod: 20, bbMult: 2, kcPeriod: 20, kcMult: 1.5 } },
      { type: "TrueStrengthIndex", params: { longPeriod: 25, shortPeriod: 13, signalPeriod: 7 } },
    ],
    rules: [
      { condition: "In squeeze AND TSI > signal AND TSI rising", action: "buy" },
      { condition: "In squeeze AND TSI < signal AND TSI falling", action: "sell" },
    ],
    params: {},
  },

  // 159. Structure EMA Cloud - Market structure + EMA ribbon
  {
    id: "structure_ema_cloud",
    name: "Structure EMA Cloud",
    indicators: [
      { type: "MarketStructure", params: { swingLookback: 5 } },
      { type: "EMA", params: { period: 9 } },
      { type: "EMA", params: { period: 21 } },
      { type: "EMA", params: { period: 55 } },
    ],
    rules: [
      { condition: "Trend is up AND EMA9 > EMA21 > EMA55 AND price > EMA9", action: "buy" },
      { condition: "Trend is down AND EMA9 < EMA21 < EMA55 AND price < EMA9", action: "sell" },
    ],
    params: {},
  },

  // 160. Ultimate Confluence V11 - 5-factor alignment for highest conviction
  {
    id: "ultimate_confluence_v11",
    name: "Ultimate Confluence V11",
    indicators: [
      { type: "IchimokuCloud", params: { tenkanPeriod: 9, kijunPeriod: 26, senkouBPeriod: 52, displacement: 26 } },
      { type: "RSI", params: { period: 14 } },
      { type: "MACD", params: { fastPeriod: 12, slowPeriod: 26, signalPeriod: 9 } },
      { type: "ADX", params: { period: 14 } },
      { type: "VolumeSMA", params: { period: 20 } },
    ],
    rules: [
      { condition: "Price above cloud AND RSI > 55 AND MACD > signal AND ADX > 25 AND volume > avg", action: "buy" },
      { condition: "Price below cloud AND RSI < 45 AND MACD < signal AND ADX > 25 AND volume > avg", action: "sell" },
    ],
    params: { rsiLong: 55, rsiShort: 45, adxThreshold: 25 },
  },
];

// Generate all parameter combinations for a strategy template
export function generateVariations(template: StrategyConfig): StrategyConfig[] {
  const variations: StrategyConfig[] = [];
  const templateId = template.id;

  switch (templateId) {
    case "supertrend_trend": {
      for (const period of PARAM_RANGES.Supertrend.period) {
        for (const multiplier of PARAM_RANGES.Supertrend.multiplier) {
          variations.push({
            ...template,
            id: `${templateId}_${period}_${multiplier}`,
            params: { period, multiplier },
            indicators: [{ type: "Supertrend", params: { period, multiplier } }],
          });
        }
      }
      break;
    }

    case "donchian_breakout": {
      for (const period of PARAM_RANGES.Donchian.period) {
        for (const adxThreshold of PARAM_RANGES.ADX.threshold) {
          variations.push({
            ...template,
            id: `${templateId}_${period}_${adxThreshold}`,
            params: { period, adxThreshold },
            indicators: [
              { type: "Donchian", params: { period } },
              { type: "ADX", params: { period: 14 } },
            ],
          });
        }
      }
      break;
    }

    case "ema_rsi_momentum": {
      for (const fastEMA of PARAM_RANGES.EMA.fastPeriod) {
        for (const slowEMA of PARAM_RANGES.EMA.slowPeriod) {
          if (slowEMA > fastEMA * 1.5) {
            for (const rsiPeriod of PARAM_RANGES.RSI.period) {
              variations.push({
                ...template,
                id: `${templateId}_${fastEMA}_${slowEMA}_${rsiPeriod}`,
                params: { fastEMA, slowEMA, rsiPeriod, rsiThreshold: 50 },
                indicators: [
                  { type: "EMA", params: { period: fastEMA } },
                  { type: "EMA", params: { period: slowEMA } },
                  { type: "RSI", params: { period: rsiPeriod } },
                ],
              });
            }
          }
        }
      }
      break;
    }

    case "keltner_volume_breakout": {
      for (const emaPeriod of PARAM_RANGES.Keltner.emaPeriod) {
        for (const multiplier of PARAM_RANGES.Keltner.multiplier) {
          for (const volumeMultiplier of PARAM_RANGES.Volume.multiplier) {
            variations.push({
              ...template,
              id: `${templateId}_${emaPeriod}_${multiplier}_${volumeMultiplier}`,
              params: { emaPeriod, atrPeriod: 10, multiplier, volumePeriod: 20, volumeMultiplier },
              indicators: [
                { type: "Keltner", params: { emaPeriod, atrPeriod: 10, multiplier } },
                { type: "VolumeSMA", params: { period: 20 } },
              ],
            });
          }
        }
      }
      break;
    }

    case "macd_histogram_momentum": {
      for (const fastPeriod of PARAM_RANGES.MACD.fastPeriod) {
        for (const slowPeriod of PARAM_RANGES.MACD.slowPeriod) {
          if (slowPeriod > fastPeriod) {
            variations.push({
              ...template,
              id: `${templateId}_${fastPeriod}_${slowPeriod}`,
              params: { macdFast: fastPeriod, macdSlow: slowPeriod, macdSignal: 9, trendEMA: 50 },
              indicators: [
                { type: "MACD", params: { fastPeriod, slowPeriod, signalPeriod: 9 } },
                { type: "EMA", params: { period: 50 } },
              ],
            });
          }
        }
      }
      break;
    }

    case "adx_di_crossover": {
      for (const adxPeriod of PARAM_RANGES.ADX.period) {
        for (const adxThreshold of PARAM_RANGES.ADX.threshold) {
          variations.push({
            ...template,
            id: `${templateId}_${adxPeriod}_${adxThreshold}`,
            params: { adxPeriod, adxThreshold },
            indicators: [{ type: "ADX", params: { period: adxPeriod } }],
          });
        }
      }
      break;
    }

    case "hull_ma_trend": {
      const hmaFastPeriods = [9, 12, 16];
      const hmaSlowPeriods = [21, 26, 34];
      for (const fastHMA of hmaFastPeriods) {
        for (const slowHMA of hmaSlowPeriods) {
          if (slowHMA > fastHMA) {
            variations.push({
              ...template,
              id: `${templateId}_${fastHMA}_${slowHMA}`,
              params: { fastHMA, slowHMA },
              indicators: [
                { type: "HMA", params: { period: fastHMA } },
                { type: "HMA", params: { period: slowHMA } },
              ],
            });
          }
        }
      }
      break;
    }

    case "parabolic_sar_trend": {
      const afSteps = [0.01, 0.02, 0.025];
      const afMaxes = [0.15, 0.2, 0.25];
      for (const afStep of afSteps) {
        for (const afMax of afMaxes) {
          if (afMax > afStep * 5) {
            for (const adxThreshold of PARAM_RANGES.ADX.threshold) {
              variations.push({
                ...template,
                id: `${templateId}_${afStep}_${afMax}_${adxThreshold}`,
                params: { afStart: afStep, afStep, afMax, adxThreshold },
                indicators: [
                  { type: "ParabolicSAR", params: { afStart: afStep, afStep, afMax } },
                  { type: "ADX", params: { period: 14 } },
                ],
              });
            }
          }
        }
      }
      break;
    }

    case "momentum_surge": {
      for (const rsiLong of PARAM_RANGES.RSI.momentumLong) {
        for (const adxThreshold of PARAM_RANGES.ADX.threshold) {
          const rsiShort = 100 - rsiLong;
          variations.push({
            ...template,
            id: `${templateId}_${rsiLong}_${adxThreshold}`,
            params: { rsiPeriod: 14, adxPeriod: 14, emaPeriod: 20, rsiLong, rsiShort, adxThreshold },
            indicators: [
              { type: "RSI", params: { period: 14 } },
              { type: "ADX", params: { period: 14 } },
              { type: "EMA", params: { period: 20 } },
            ],
          });
        }
      }
      break;
    }

    case "fast_ema_scalper": {
      const fastPeriods = [3, 5, 8];
      const slowPeriods = [10, 13, 21];
      const rsiPeriods = [5, 7, 9];
      for (const fast of fastPeriods) {
        for (const slow of slowPeriods) {
          if (slow > fast * 1.5) {
            for (const rsiP of rsiPeriods) {
              variations.push({
                ...template,
                id: `${templateId}_${fast}_${slow}_${rsiP}`,
                params: { fastEMA: fast, slowEMA: slow, rsiPeriod: rsiP, rsiMidline: 50 },
                indicators: [
                  { type: "EMA", params: { period: fast } },
                  { type: "EMA", params: { period: slow } },
                  { type: "RSI", params: { period: rsiP } },
                ],
              });
            }
          }
        }
      }
      break;
    }

    case "momentum_burst": {
      const rsiLongs = [55, 60, 65];
      const adxThresholds = [25, 30, 35];
      for (const rsiLong of rsiLongs) {
        for (const adxT of adxThresholds) {
          variations.push({
            ...template,
            id: `${templateId}_${rsiLong}_${adxT}`,
            params: { rsiPeriod: 7, adxPeriod: 10, emaPeriod: 10, rsiLong, rsiShort: 100 - rsiLong, adxThreshold: adxT },
            indicators: [
              { type: "RSI", params: { period: 7 } },
              { type: "ADX", params: { period: 10 } },
              { type: "EMA", params: { period: 10 } },
            ],
          });
        }
      }
      break;
    }

    case "vwap_bounce": {
      const rsiPeriods = [7, 9, 14];
      for (const rsiP of rsiPeriods) {
        variations.push({
          ...template,
          id: `${templateId}_${rsiP}`,
          params: { rsiPeriod: rsiP },
          indicators: [
            { type: "VWAP", params: {} },
            { type: "RSI", params: { period: rsiP } },
          ],
        });
      }
      break;
    }

    case "range_breakout": {
      const atrPeriods = [7, 10, 14];
      const emaPeriods = [10, 20, 30];
      const multipliers = [1.0, 1.5, 2.0];
      for (const atrP of atrPeriods) {
        for (const emaP of emaPeriods) {
          for (const mult of multipliers) {
            variations.push({
              ...template,
              id: `${templateId}_${atrP}_${emaP}_${mult}`,
              params: { atrPeriod: atrP, emaPeriod: emaP, atrMultiplier: mult },
              indicators: [
                { type: "ATR", params: { period: atrP } },
                { type: "EMA", params: { period: emaP } },
              ],
            });
          }
        }
      }
      break;
    }

    case "williams_r_extremes": {
      const periods = [10, 14, 21];
      const emaPeriods = [10, 20];
      const oversolds = [-85, -80, -75];
      for (const period of periods) {
        for (const emaP of emaPeriods) {
          for (const oversold of oversolds) {
            variations.push({
              ...template,
              id: `${templateId}_${period}_${emaP}_${Math.abs(oversold)}`,
              params: { period, emaPeriod: emaP, oversold, overbought: -100 - oversold },
              indicators: [
                { type: "WilliamsR", params: { period } },
                { type: "EMA", params: { period: emaP } },
              ],
            });
          }
        }
      }
      break;
    }

    // ============ SCALPING STRATEGY VARIATIONS ============

    case "rsi_bounce": {
      const periods = [3, 5, 7];
      const oversolds = [20, 25, 30];
      for (const period of periods) {
        for (const oversold of oversolds) {
          variations.push({
            ...template,
            id: `${templateId}_${period}_${oversold}`,
            params: { rsiPeriod: period, oversold, overbought: 100 - oversold },
            indicators: [{ type: "RSI", params: { period } }],
          });
        }
      }
      break;
    }

    case "bb_bounce": {
      const periods = [8, 10, 14];
      const stdDevs = [1.5, 2, 2.5];
      for (const period of periods) {
        for (const stdDev of stdDevs) {
          variations.push({
            ...template,
            id: `${templateId}_${period}_${stdDev}`,
            params: { period, stdDev },
            indicators: [{ type: "Bollinger", params: { period, stdDev } }],
          });
        }
      }
      break;
    }

    case "micro_ema": {
      const fastPeriods = [2, 3, 5];
      const slowPeriods = [5, 8, 13];
      for (const fast of fastPeriods) {
        for (const slow of slowPeriods) {
          if (slow > fast) {
            variations.push({
              ...template,
              id: `${templateId}_${fast}_${slow}`,
              params: { fastEMA: fast, slowEMA: slow },
              indicators: [
                { type: "EMA", params: { period: fast } },
                { type: "EMA", params: { period: slow } },
              ],
            });
          }
        }
      }
      break;
    }

    case "stoch_scalp": {
      const periods = [5, 7, 9];
      const oversolds = [15, 20, 25];
      for (const period of periods) {
        for (const oversold of oversolds) {
          variations.push({
            ...template,
            id: `${templateId}_${period}_${oversold}`,
            params: { rsiPeriod: period, stochPeriod: period, oversold, overbought: 100 - oversold },
            indicators: [{ type: "StochRSI", params: { rsiPeriod: period, stochPeriod: period } }],
          });
        }
      }
      break;
    }

    case "candle_scalp": {
      // No parameters to vary - just one version
      variations.push(template);
      break;
    }

    case "volatility_scalp": {
      const atrPeriods = [3, 5, 7];
      const multipliers = [1.2, 1.5, 2.0];
      for (const atrPeriod of atrPeriods) {
        for (const mult of multipliers) {
          variations.push({
            ...template,
            id: `${templateId}_${atrPeriod}_${mult}`,
            params: { atrPeriod, emaPeriod: 5, atrMultiplier: mult },
            indicators: [
              { type: "ATR", params: { period: atrPeriod } },
              { type: "EMA", params: { period: 5 } },
            ],
          });
        }
      }
      break;
    }

    case "macd_zero": {
      const fastPeriods = [3, 5, 8];
      const slowPeriods = [10, 13, 17];
      for (const fast of fastPeriods) {
        for (const slow of slowPeriods) {
          if (slow > fast) {
            variations.push({
              ...template,
              id: `${templateId}_${fast}_${slow}`,
              params: { fastPeriod: fast, slowPeriod: slow, signalPeriod: 4 },
              indicators: [{ type: "MACD", params: { fastPeriod: fast, slowPeriod: slow, signalPeriod: 4 } }],
            });
          }
        }
      }
      break;
    }

    // ============ V3 STRATEGY VARIATIONS ============

    case "rsi_momentum_burst": {
      const rsiPeriods = [7, 9, 14];
      const emaPeriods = [13, 21, 34];
      const rsiLongs = [60, 65, 70];
      for (const rsiP of rsiPeriods) {
        for (const emaP of emaPeriods) {
          for (const rsiL of rsiLongs) {
            variations.push({
              ...template,
              id: `${templateId}_${rsiP}_${emaP}_${rsiL}`,
              params: { rsiPeriod: rsiP, emaPeriod: emaP, adxPeriod: 14, rsiLong: rsiL, rsiShort: 100 - rsiL, adxThreshold: 20 },
              indicators: [
                { type: "RSI", params: { period: rsiP } },
                { type: "EMA", params: { period: emaP } },
                { type: "ADX", params: { period: 14 } },
              ],
            });
          }
        }
      }
      break;
    }

    case "breakout_explosion": {
      const atrPeriods = [10, 14, 20];
      const donchianPeriods = [5, 10, 15];
      const expansions = [1.2, 1.3, 1.5];
      for (const atrP of atrPeriods) {
        for (const donP of donchianPeriods) {
          for (const exp of expansions) {
            variations.push({
              ...template,
              id: `${templateId}_${atrP}_${donP}_${exp}`,
              params: { atrPeriod: atrP, donchianPeriod: donP, atrExpansion: exp },
              indicators: [
                { type: "ATR", params: { period: atrP } },
                { type: "Donchian", params: { period: donP } },
              ],
            });
          }
        }
      }
      break;
    }

    case "triple_momentum": {
      const rsiLongs = [50, 55, 60];
      const adxThresholds = [20, 25, 30];
      for (const rsiL of rsiLongs) {
        for (const adxT of adxThresholds) {
          variations.push({
            ...template,
            id: `${templateId}_${rsiL}_${adxT}`,
            params: { rsiPeriod: 14, rsiLong: rsiL, rsiShort: 100 - rsiL, adxThreshold: adxT },
            indicators: [
              { type: "RSI", params: { period: 14 } },
              { type: "MACD", params: { fastPeriod: 12, slowPeriod: 26, signalPeriod: 9 } },
              { type: "ADX", params: { period: 14 } },
            ],
          });
        }
      }
      break;
    }

    case "volume_climax": {
      const volumeMults = [1.5, 2, 2.5];
      const rsiOversolds = [25, 30, 35];
      for (const volM of volumeMults) {
        for (const rsiOS of rsiOversolds) {
          variations.push({
            ...template,
            id: `${templateId}_${volM}_${rsiOS}`,
            params: { volumePeriod: 20, volumeMultiplier: volM, rsiPeriod: 14, rsiOversold: rsiOS, rsiOverbought: 100 - rsiOS, bbPeriod: 20 },
            indicators: [
              { type: "VolumeSMA", params: { period: 20 } },
              { type: "RSI", params: { period: 14 } },
              { type: "Bollinger", params: { period: 20, stdDev: 2 } },
            ],
          });
        }
      }
      break;
    }

    case "ema_ribbon": {
      // Just one variation - the ribbon is fixed
      variations.push({
        ...template,
        id: `${templateId}`,
        params: { ema1: 8, ema2: 13, ema3: 21, ema4: 34 },
        indicators: [
          { type: "EMA", params: { period: 8 } },
          { type: "EMA", params: { period: 13 } },
          { type: "EMA", params: { period: 21 } },
          { type: "EMA", params: { period: 34 } },
        ],
      });
      break;
    }

    case "roc_spike": {
      const rocPeriods = [5, 10, 14];
      const thresholds = [1.5, 2, 3];
      for (const rocP of rocPeriods) {
        for (const thresh of thresholds) {
          variations.push({
            ...template,
            id: `${templateId}_${rocP}_${thresh}`,
            params: { rocPeriod: rocP, emaPeriod: 20, threshold: thresh },
            indicators: [
              { type: "ROC", params: { period: rocP } },
              { type: "EMA", params: { period: 20 } },
            ],
          });
        }
      }
      break;
    }

    case "mfi_momentum": {
      const mfiPeriods = [10, 14, 20];
      for (const mfiP of mfiPeriods) {
        variations.push({
          ...template,
          id: `${templateId}_${mfiP}`,
          params: { mfiPeriod: mfiP, emaPeriod: 20 },
          indicators: [
            { type: "MFI", params: { period: mfiP } },
            { type: "EMA", params: { period: 20 } },
          ],
        });
      }
      break;
    }

    case "obv_breakout": {
      const donchianPeriods = [10, 20, 30];
      for (const donP of donchianPeriods) {
        variations.push({
          ...template,
          id: `${templateId}_${donP}`,
          params: { donchianPeriod: donP },
          indicators: [
            { type: "OBV", params: {} },
            { type: "Donchian", params: { period: donP } },
          ],
        });
      }
      break;
    }

    case "cci_momentum": {
      const cciPeriods = [14, 20, 30];
      const thresholds = [80, 100, 120];
      for (const cciP of cciPeriods) {
        for (const thresh of thresholds) {
          variations.push({
            ...template,
            id: `${templateId}_${cciP}_${thresh}`,
            params: { cciPeriod: cciP, emaPeriod: 50, cciThreshold: thresh },
            indicators: [
              { type: "CCI", params: { period: cciP } },
              { type: "EMA", params: { period: 50 } },
            ],
          });
        }
      }
      break;
    }

    case "channel_position": {
      const periods = [10, 20, 30];
      const lowThresholds = [15, 20, 25];
      for (const period of periods) {
        for (const lowT of lowThresholds) {
          variations.push({
            ...template,
            id: `${templateId}_${period}_${lowT}`,
            params: { period, adxPeriod: 14, lowThreshold: lowT, highThreshold: 100 - lowT, adxRangeThreshold: 25 },
            indicators: [
              { type: "PriceChannelPosition", params: { period } },
              { type: "ADX", params: { period: 14 } },
            ],
          });
        }
      }
      break;
    }

    // ============ V4 STRATEGY VARIATIONS ============

    case "vwap_macd_rsi": {
      const rsiPeriods = [9, 14, 21];
      for (const rsiP of rsiPeriods) {
        variations.push({
          ...template,
          id: `${templateId}_${rsiP}`,
          params: { rsiPeriod: rsiP, rsiOverbought: 70, rsiOversold: 30 },
          indicators: [
            { type: "VWAP", params: {} },
            { type: "MACD", params: { fastPeriod: 12, slowPeriod: 26, signalPeriod: 9 } },
            { type: "RSI", params: { period: rsiP } },
          ],
        });
      }
      break;
    }

    case "rsi_bb_confluence": {
      const rsiPeriods = [7, 14, 21];
      const bbPeriods = [15, 20, 25];
      for (const rsiP of rsiPeriods) {
        for (const bbP of bbPeriods) {
          variations.push({
            ...template,
            id: `${templateId}_${rsiP}_${bbP}`,
            params: { rsiPeriod: rsiP, bbPeriod: bbP, bbStdDev: 2, rsiOversold: 30, rsiOverbought: 70 },
            indicators: [
              { type: "RSI", params: { period: rsiP } },
              { type: "Bollinger", params: { period: bbP, stdDev: 2 } },
            ],
          });
        }
      }
      break;
    }

    case "fast_ema_stack": {
      const rsiPeriods = [5, 9, 14];
      for (const rsiP of rsiPeriods) {
        variations.push({
          ...template,
          id: `${templateId}_${rsiP}`,
          params: { rsiPeriod: rsiP },
          indicators: [
            { type: "EMA", params: { period: 3 } },
            { type: "EMA", params: { period: 8 } },
            { type: "EMA", params: { period: 21 } },
            { type: "RSI", params: { period: rsiP } },
          ],
        });
      }
      break;
    }

    case "atr_optimal_vol": {
      const atrPeriods = [10, 14, 20];
      const emaPeriods = [13, 20, 34];
      for (const atrP of atrPeriods) {
        for (const emaP of emaPeriods) {
          variations.push({
            ...template,
            id: `${templateId}_${atrP}_${emaP}`,
            params: { atrPeriod: atrP, emaPeriod: emaP, rsiPeriod: 14, atrMinPct: 0.5, atrMaxPct: 3.0 },
            indicators: [
              { type: "ATR", params: { period: atrP } },
              { type: "EMA", params: { period: emaP } },
              { type: "RSI", params: { period: 14 } },
            ],
          });
        }
      }
      break;
    }

    case "sr_bounce": {
      const donchianPeriods = [10, 20, 30];
      const rsiPeriods = [5, 7, 9];
      for (const donP of donchianPeriods) {
        for (const rsiP of rsiPeriods) {
          variations.push({
            ...template,
            id: `${templateId}_${donP}_${rsiP}`,
            params: { donchianPeriod: donP, rsiPeriod: rsiP, adxPeriod: 14, nearPct: 5 },
            indicators: [
              { type: "Donchian", params: { period: donP } },
              { type: "RSI", params: { period: rsiP } },
              { type: "ADX", params: { period: 14 } },
            ],
          });
        }
      }
      break;
    }

    case "macd_vol_cross": {
      const macdFasts = [8, 12];
      const macdSlows = [17, 21, 26];
      for (const fast of macdFasts) {
        for (const slow of macdSlows) {
          if (slow > fast) {
            variations.push({
              ...template,
              id: `${templateId}_${fast}_${slow}`,
              params: { macdFast: fast, macdSlow: slow, macdSignal: 9, volumeMultiplier: 1.2 },
              indicators: [
                { type: "MACD", params: { fastPeriod: fast, slowPeriod: slow, signalPeriod: 9 } },
                { type: "VolumeSMA", params: { period: 20 } },
                { type: "EMA", params: { period: 50 } },
              ],
            });
          }
        }
      }
      break;
    }

    case "stoch_macd_combo": {
      const stochPeriods = [7, 14, 21];
      const oversolds = [15, 20, 25];
      for (const stochP of stochPeriods) {
        for (const os of oversolds) {
          variations.push({
            ...template,
            id: `${templateId}_${stochP}_${os}`,
            params: { stochPeriod: stochP, stochOversold: os, stochOverbought: 100 - os },
            indicators: [
              { type: "StochRSI", params: { rsiPeriod: stochP, stochPeriod: stochP } },
              { type: "MACD", params: { fastPeriod: 12, slowPeriod: 26, signalPeriod: 9 } },
            ],
          });
        }
      }
      break;
    }

    case "aggressive_momentum": {
      const rsiLongs = [52, 55, 58];
      const emaPeriods = [3, 5, 8];
      for (const rsiL of rsiLongs) {
        for (const emaP of emaPeriods) {
          variations.push({
            ...template,
            id: `${templateId}_${rsiL}_${emaP}`,
            params: { rsiPeriod: 5, rsiLong: rsiL, rsiShort: 100 - rsiL, emaPeriod: emaP },
            indicators: [
              { type: "RSI", params: { period: 5 } },
              { type: "EMA", params: { period: emaP } },
              { type: "EMA", params: { period: emaP * 2 } },
            ],
          });
        }
      }
      break;
    }

    case "keltner_rsi_breakout": {
      const keltnerMults = [1.5, 2, 2.5];
      const rsiPeriods = [9, 14, 21];
      for (const mult of keltnerMults) {
        for (const rsiP of rsiPeriods) {
          variations.push({
            ...template,
            id: `${templateId}_${mult}_${rsiP}`,
            params: { keltnerEMA: 20, keltnerATR: 10, keltnerMult: mult, rsiPeriod: rsiP },
            indicators: [
              { type: "Keltner", params: { emaPeriod: 20, atrPeriod: 10, multiplier: mult } },
              { type: "RSI", params: { period: rsiP } },
            ],
          });
        }
      }
      break;
    }

    case "double_pattern": {
      const donchianPeriods = [5, 10, 15];
      for (const donP of donchianPeriods) {
        variations.push({
          ...template,
          id: `${templateId}_${donP}`,
          params: { rsiPeriod: 14, donchianPeriod: donP, atrPeriod: 14 },
          indicators: [
            { type: "RSI", params: { period: 14 } },
            { type: "Donchian", params: { period: donP } },
            { type: "ATR", params: { period: 14 } },
          ],
        });
      }
      break;
    }

    // ============ V5 STRATEGY VARIATIONS ============

    case "double_supertrend": {
      const fastPeriods = [7, 10, 14];
      const slowPeriods = [20, 25, 30];
      const fastMults = [2, 3];
      const slowMults = [4, 5];
      for (const fp of fastPeriods) {
        for (const sp of slowPeriods) {
          for (const fm of fastMults) {
            for (const sm of slowMults) {
              if (sp > fp && sm > fm) {
                variations.push({
                  ...template,
                  id: `${templateId}_${fp}_${fm}_${sp}_${sm}`,
                  params: { fastPeriod: fp, fastMult: fm, slowPeriod: sp, slowMult: sm },
                  indicators: [
                    { type: "Supertrend", params: { period: fp, multiplier: fm } },
                    { type: "Supertrend", params: { period: sp, multiplier: sm } },
                  ],
                });
              }
            }
          }
        }
      }
      break;
    }

    case "elder_impulse": {
      const emaPeriods = [9, 13, 21];
      for (const emaP of emaPeriods) {
        variations.push({
          ...template,
          id: `${templateId}_${emaP}`,
          params: { emaPeriod: emaP },
          indicators: [
            { type: "EMA", params: { period: emaP } },
            { type: "MACD", params: { fastPeriod: 12, slowPeriod: 26, signalPeriod: 9 } },
          ],
        });
      }
      break;
    }

    case "hull_cci_combo": {
      const fastHMAs = [9, 12, 16];
      const slowHMAs = [21, 26, 34];
      const cciThresholds = [80, 100, 120];
      for (const fh of fastHMAs) {
        for (const sh of slowHMAs) {
          if (sh > fh) {
            for (const cciT of cciThresholds) {
              variations.push({
                ...template,
                id: `${templateId}_${fh}_${sh}_${cciT}`,
                params: { fastHMA: fh, slowHMA: sh, cciPeriod: 14, cciThreshold: cciT },
                indicators: [
                  { type: "HMA", params: { period: fh } },
                  { type: "HMA", params: { period: sh } },
                  { type: "CCI", params: { period: 14 } },
                ],
              });
            }
          }
        }
      }
      break;
    }

    case "rsi_bb_vol": {
      const rsiPeriods = [5, 7, 9];
      const bbPeriods = [10, 15, 20];
      const volMults = [1.0, 1.2, 1.5];
      for (const rsiP of rsiPeriods) {
        for (const bbP of bbPeriods) {
          for (const volM of volMults) {
            variations.push({
              ...template,
              id: `${templateId}_${rsiP}_${bbP}_${volM}`,
              params: { rsiPeriod: rsiP, bbPeriod: bbP, volumeMultiplier: volM },
              indicators: [
                { type: "RSI", params: { period: rsiP } },
                { type: "Bollinger", params: { period: bbP, stdDev: 2 } },
                { type: "VolumeSMA", params: { period: 20 } },
              ],
            });
          }
        }
      }
      break;
    }

    case "triple_ema_vol": {
      const volMults = [1.2, 1.3, 1.5, 1.8];
      for (const volM of volMults) {
        variations.push({
          ...template,
          id: `${templateId}_${volM}`,
          params: { volumeMultiplier: volM },
          indicators: [
            { type: "EMA", params: { period: 9 } },
            { type: "EMA", params: { period: 21 } },
            { type: "EMA", params: { period: 55 } },
            { type: "VolumeSMA", params: { period: 20 } },
          ],
        });
      }
      break;
    }

    case "adx_momentum_breakout": {
      const adxThresholds = [25, 30, 35];
      const rsiLongs = [52, 55, 58];
      for (const adxT of adxThresholds) {
        for (const rsiL of rsiLongs) {
          variations.push({
            ...template,
            id: `${templateId}_${adxT}_${rsiL}`,
            params: { adxThreshold: adxT, rsiLong: rsiL, rsiShort: 100 - rsiL },
            indicators: [
              { type: "ADX", params: { period: 14 } },
              { type: "RSI", params: { period: 9 } },
              { type: "ATR", params: { period: 14 } },
              { type: "EMA", params: { period: 20 } },
            ],
          });
        }
      }
      break;
    }

    case "mean_reversion_plus": {
      const bbStdDevs = [2, 2.5, 3];
      const rsiPeriods = [3, 5, 7];
      for (const bbStd of bbStdDevs) {
        for (const rsiP of rsiPeriods) {
          variations.push({
            ...template,
            id: `${templateId}_${bbStd}_${rsiP}`,
            params: { bbPeriod: 20, bbStdDev: bbStd, rsiPeriod: rsiP },
            indicators: [
              { type: "Bollinger", params: { period: 20, stdDev: bbStd } },
              { type: "RSI", params: { period: rsiP } },
              { type: "StochRSI", params: { rsiPeriod: rsiP, stochPeriod: rsiP } },
            ],
          });
        }
      }
      break;
    }

    case "macd_divergence": {
      const lookbacks = [5, 10, 15];
      for (const lb of lookbacks) {
        variations.push({
          ...template,
          id: `${templateId}_${lb}`,
          params: { lookback: lb },
          indicators: [
            { type: "MACD", params: { fastPeriod: 12, slowPeriod: 26, signalPeriod: 9 } },
            { type: "EMA", params: { period: 50 } },
          ],
        });
      }
      break;
    }

    case "volatility_squeeze_pro": {
      // Only one variation - complex strategy
      variations.push({
        ...template,
        id: `${templateId}`,
        params: {},
        indicators: [
          { type: "Bollinger", params: { period: 20, stdDev: 2 } },
          { type: "Keltner", params: { emaPeriod: 20, atrPeriod: 10, multiplier: 1.5 } },
          { type: "RSI", params: { period: 14 } },
          { type: "MACD", params: { fastPeriod: 12, slowPeriod: 26, signalPeriod: 9 } },
        ],
      });
      break;
    }

    case "momentum_wave": {
      const rocThresholds = [1.5, 2, 3];
      const mfiLongs = [55, 60, 65];
      for (const rocT of rocThresholds) {
        for (const mfiL of mfiLongs) {
          variations.push({
            ...template,
            id: `${templateId}_${rocT}_${mfiL}`,
            params: { rocThreshold: rocT, mfiLong: mfiL, mfiShort: 100 - mfiL },
            indicators: [
              { type: "ROC", params: { period: 10 } },
              { type: "MFI", params: { period: 14 } },
              { type: "EMA", params: { period: 21 } },
            ],
          });
        }
      }
      break;
    }

    case "trend_strength_pro": {
      const adxThresholds = [30, 35, 40];
      const fastHMAs = [7, 9, 12];
      const slowHMAs = [18, 21, 26];
      for (const adxT of adxThresholds) {
        for (const fh of fastHMAs) {
          for (const sh of slowHMAs) {
            if (sh > fh * 1.5) {
              variations.push({
                ...template,
                id: `${templateId}_${adxT}_${fh}_${sh}`,
                params: { adxThreshold: adxT, fastHMA: fh, slowHMA: sh },
                indicators: [
                  { type: "ADX", params: { period: 14 } },
                  { type: "HMA", params: { period: fh } },
                  { type: "HMA", params: { period: sh } },
                  { type: "ATR", params: { period: 14 } },
                ],
              });
            }
          }
        }
      }
      break;
    }

    // ============ V10 STRATEGY VARIATIONS - ITERATION 51 ============

    case "adx_kst_pro": {
      const adxThresholds = [20, 25, 30];
      const emaPeriods = [13, 21, 34];
      for (const adxT of adxThresholds) {
        for (const emaP of emaPeriods) {
          variations.push({
            ...template,
            id: `${templateId}_${adxT}_${emaP}`,
            params: { adxThreshold: adxT, emaPeriod: emaP },
            indicators: [
              { type: "ADX", params: { period: 14 } },
              { type: "KnowSureThing", params: {} },
              { type: "EMA", params: { period: emaP } },
            ],
          });
        }
      }
      break;
    }

    case "quad_momentum": {
      const rsiLongs = [52, 55, 58];
      const adxThresholds = [20, 25, 30];
      for (const rsiL of rsiLongs) {
        for (const adxT of adxThresholds) {
          variations.push({
            ...template,
            id: `${templateId}_${rsiL}_${adxT}`,
            params: { rsiLong: rsiL, rsiShort: 100 - rsiL, adxThreshold: adxT },
          });
        }
      }
      break;
    }

    case "momentum_burst_vol": {
      const rsiLongs = [55, 60, 65];
      const adxThresholds = [25, 30, 35];
      const volumeMultipliers = [1.0, 1.2, 1.5];
      for (const rsiL of rsiLongs) {
        for (const adxT of adxThresholds) {
          for (const volM of volumeMultipliers) {
            variations.push({
              ...template,
              id: `${templateId}_${rsiL}_${adxT}_${volM}`,
              params: { rsiLong: rsiL, rsiShort: 100 - rsiL, adxThreshold: adxT, volumeMultiplier: volM },
            });
          }
        }
      }
      break;
    }

    case "rsi_adx_surge_pro": {
      const rsiLongs = [52, 55, 58];
      const adxThresholds = [20, 25, 30];
      const fastEMAs = [9, 13, 21];
      for (const rsiL of rsiLongs) {
        for (const adxT of adxThresholds) {
          for (const emaF of fastEMAs) {
            variations.push({
              ...template,
              id: `${templateId}_${rsiL}_${adxT}_${emaF}`,
              params: { rsiLong: rsiL, rsiShort: 100 - rsiL, adxThreshold: adxT, fastEMA: emaF, slowEMA: emaF * 2 + 8 },
              indicators: [
                { type: "RSI", params: { period: 9 } },
                { type: "ADX", params: { period: 14 } },
                { type: "EMA", params: { period: emaF } },
                { type: "EMA", params: { period: emaF * 2 + 8 } },
              ],
            });
          }
        }
      }
      break;
    }

    case "tsi_kst_confluence": {
      const adxThresholds = [15, 20, 25];
      for (const adxT of adxThresholds) {
        variations.push({
          ...template,
          id: `${templateId}_${adxT}`,
          params: { adxThreshold: adxT },
        });
      }
      break;
    }

    case "efi_rsi_momentum": {
      const rsiLongs = [52, 55, 58];
      const emaPeriods = [13, 21, 34];
      for (const rsiL of rsiLongs) {
        for (const emaP of emaPeriods) {
          variations.push({
            ...template,
            id: `${templateId}_${rsiL}_${emaP}`,
            params: { rsiLong: rsiL, rsiShort: 100 - rsiL },
            indicators: [
              { type: "ElderForceIndex", params: { period: 13 } },
              { type: "RSI", params: { period: 9 } },
              { type: "EMA", params: { period: emaP } },
            ],
          });
        }
      }
      break;
    }

    case "supertrend_adx_vol": {
      const adxThresholds = [20, 25, 30];
      const volumeMultipliers = [1.0, 1.3, 1.5];
      const stPeriods = [10, 12, 14];
      for (const adxT of adxThresholds) {
        for (const volM of volumeMultipliers) {
          for (const stP of stPeriods) {
            variations.push({
              ...template,
              id: `${templateId}_${adxT}_${volM}_${stP}`,
              params: { adxThreshold: adxT, volumeMultiplier: volM },
              indicators: [
                { type: "Supertrend", params: { period: stP, multiplier: 3 } },
                { type: "ADX", params: { period: 14 } },
                { type: "VolumeSMA", params: { period: 20 } },
              ],
            });
          }
        }
      }
      break;
    }

    case "fast_momentum_scalp": {
      const rsiLongs = [52, 55, 58];
      const adxThresholds = [15, 20, 25];
      for (const rsiL of rsiLongs) {
        for (const adxT of adxThresholds) {
          variations.push({
            ...template,
            id: `${templateId}_${rsiL}_${adxT}`,
            params: { rsiLong: rsiL, rsiShort: 100 - rsiL, adxThreshold: adxT },
          });
        }
      }
      break;
    }

    case "breakout_momentum_pro": {
      const donchianPeriods = [10, 15, 20];
      const adxThresholds = [20, 25, 30];
      for (const donP of donchianPeriods) {
        for (const adxT of adxThresholds) {
          variations.push({
            ...template,
            id: `${templateId}_${donP}_${adxT}`,
            params: { donchianPeriod: donP, adxThreshold: adxT },
            indicators: [
              { type: "Donchian", params: { period: donP } },
              { type: "RSI", params: { period: 14 } },
              { type: "ADX", params: { period: 14 } },
            ],
          });
        }
      }
      break;
    }

    case "stc_adx_trend": {
      const stcLows = [20, 25, 30];
      const adxThresholds = [15, 20, 25];
      for (const stcL of stcLows) {
        for (const adxT of adxThresholds) {
          variations.push({
            ...template,
            id: `${templateId}_${stcL}_${adxT}`,
            params: { stcLow: stcL, stcHigh: 100 - stcL, adxThreshold: adxT },
          });
        }
      }
      break;
    }

    default:
      // For other strategies, just use the template as-is
      variations.push(template);
  }

  return variations;
}

// Generate all strategy variations
export function generateAllStrategies(): StrategyConfig[] {
  const allStrategies: StrategyConfig[] = [];

  for (const template of STRATEGY_TEMPLATES) {
    const variations = generateVariations(template);
    allStrategies.push(...variations);
  }

  return allStrategies;
}

// Execute strategy on candle data
export function executeStrategy(config: StrategyConfig, candles: Candle[]): StrategyResult {
  const closes = candles.map(c => c.close);
  const indicatorValues: Record<string, number[]> = {};
  const signals: Signal[] = new Array(candles.length).fill("hold");

  // Calculate all indicators
  for (const indConfig of config.indicators) {
    switch (indConfig.type) {
      case "RSI":
        indicatorValues.RSI = indicators.RSI_Simple(closes, indConfig.params.period || 14);
        break;
      case "MACD": {
        const macd = indicators.MACD(
          closes,
          indConfig.params.fastPeriod || 12,
          indConfig.params.slowPeriod || 26,
          indConfig.params.signalPeriod || 9
        );
        indicatorValues.MACD = macd.macd;
        indicatorValues.MACD_Signal = macd.signal;
        indicatorValues.MACD_Histogram = macd.histogram;
        break;
      }
      case "EMA": {
        const period = indConfig.params.period;
        indicatorValues[`EMA_${period}`] = indicators.EMA(closes, period);
        break;
      }
      case "HMA": {
        const period = indConfig.params.period;
        indicatorValues[`HMA_${period}`] = indicators.HMA(closes, period);
        break;
      }
      case "Bollinger": {
        const bb = indicators.BollingerBands(
          closes,
          indConfig.params.period || 20,
          indConfig.params.stdDev || 2
        );
        indicatorValues.BB_Upper = bb.upper;
        indicatorValues.BB_Middle = bb.middle;
        indicatorValues.BB_Lower = bb.lower;
        indicatorValues.BB_Bandwidth = bb.bandwidth;
        break;
      }
      case "ATR":
        indicatorValues.ATR = indicators.ATR(candles, indConfig.params.period || 14);
        break;
      case "StochRSI":
        indicatorValues.StochRSI = indicators.StochRSI(
          closes,
          indConfig.params.rsiPeriod || 14,
          indConfig.params.stochPeriod || 14
        );
        break;
      case "ADX": {
        const adx = indicators.ADX(candles, indConfig.params.period || 14);
        indicatorValues.ADX = adx.adx;
        indicatorValues.PlusDI = adx.plusDI;
        indicatorValues.MinusDI = adx.minusDI;
        break;
      }
      case "Supertrend": {
        const st = indicators.Supertrend(
          candles,
          indConfig.params.period || 10,
          indConfig.params.multiplier || 3
        );
        indicatorValues.Supertrend = st.trend;
        indicatorValues.SupertrendDirection = st.direction;
        break;
      }
      case "Donchian": {
        const dc = indicators.DonchianChannel(candles, indConfig.params.period || 20);
        indicatorValues.Donchian_Upper = dc.upper;
        indicatorValues.Donchian_Lower = dc.lower;
        indicatorValues.Donchian_Middle = dc.middle;
        break;
      }
      case "Keltner": {
        const kc = indicators.KeltnerChannel(
          candles,
          indConfig.params.emaPeriod || 20,
          indConfig.params.atrPeriod || 10,
          indConfig.params.multiplier || 2
        );
        indicatorValues.Keltner_Upper = kc.upper;
        indicatorValues.Keltner_Middle = kc.middle;
        indicatorValues.Keltner_Lower = kc.lower;
        break;
      }
      case "VolumeSMA": {
        indicatorValues.VolumeSMA = indicators.VolumeSMA(candles, indConfig.params.period || 20);
        break;
      }
      case "ParabolicSAR": {
        const psar = indicators.ParabolicSAR(
          candles,
          indConfig.params.afStart || 0.02,
          indConfig.params.afStep || 0.02,
          indConfig.params.afMax || 0.2
        );
        indicatorValues.SAR = psar.sar;
        indicatorValues.SAR_Trend = psar.trend;
        break;
      }
      case "CMF": {
        indicatorValues.CMF = indicators.CMF(candles, indConfig.params.period || 20);
        break;
      }
      case "VWAP": {
        indicatorValues.VWAP = indicators.VWAP(candles);
        break;
      }
      case "WilliamsR": {
        indicatorValues.WilliamsR = indicators.WilliamsR(candles, indConfig.params.period || 14);
        break;
      }
      // V3 New indicators
      case "ROC": {
        indicatorValues.ROC = indicators.ROC(closes, indConfig.params.period || 10);
        break;
      }
      case "MFI": {
        indicatorValues.MFI = indicators.MFI(candles, indConfig.params.period || 14);
        break;
      }
      case "OBV": {
        indicatorValues.OBV = indicators.OBV(candles);
        break;
      }
      case "CCI": {
        indicatorValues.CCI = indicators.CCI(candles, indConfig.params.period || 20);
        break;
      }
      case "PriceChannelPosition": {
        indicatorValues.PriceChannelPosition = indicators.PriceChannelPosition(candles, indConfig.params.period || 20);
        break;
      }
      // V9 New indicators - Iteration 23
      case "SchaffTrendCycle": {
        indicatorValues.STC = indicators.SchaffTrendCycle(
          closes,
          indConfig.params.fastPeriod || 23,
          indConfig.params.slowPeriod || 50,
          indConfig.params.cyclePeriod || 10
        );
        break;
      }
      case "ElderForceIndex": {
        indicatorValues.EFI = indicators.ElderForceIndex(candles, indConfig.params.period || 13);
        break;
      }
      case "TrueStrengthIndex": {
        const tsi = indicators.TrueStrengthIndex(
          closes,
          indConfig.params.longPeriod || 25,
          indConfig.params.shortPeriod || 13,
          indConfig.params.signalPeriod || 7
        );
        indicatorValues.TSI = tsi.tsi;
        indicatorValues.TSI_Signal = tsi.signal;
        break;
      }
      case "KnowSureThing": {
        const kst = indicators.KnowSureThing(closes);
        indicatorValues.KST = kst.kst;
        indicatorValues.KST_Signal = kst.signal;
        break;
      }
      case "ConnorsRSI": {
        indicatorValues.CRSI = indicators.ConnorsRSI(
          closes,
          indConfig.params.rsiPeriod || 3,
          indConfig.params.streakPeriod || 2,
          indConfig.params.rocPeriod || 100
        );
        break;
      }
      case "PPO": {
        const ppo = indicators.PPO(
          closes,
          indConfig.params.fastPeriod || 12,
          indConfig.params.slowPeriod || 26,
          indConfig.params.signalPeriod || 9
        );
        indicatorValues.PPO = ppo.ppo;
        indicatorValues.PPO_Signal = ppo.signal;
        indicatorValues.PPO_Histogram = ppo.histogram;
        break;
      }
      case "BalanceOfPower": {
        indicatorValues.BOP = indicators.BalanceOfPower(candles, indConfig.params.period || 14);
        break;
      }
      case "CoppockCurve": {
        indicatorValues.Coppock = indicators.CoppockCurve(
          closes,
          indConfig.params.shortROC || 11,
          indConfig.params.longROC || 14,
          indConfig.params.wmaPeriod || 10
        );
        break;
      }
      case "DetrendedPriceOscillator": {
        indicatorValues.DPO = indicators.DetrendedPriceOscillator(closes, indConfig.params.period || 20);
        break;
      }

      // ============ V11 INDICATORS - ITERATION 67 ============
      case "IchimokuCloud": {
        const ichimoku = indicators.IchimokuCloud(
          candles,
          indConfig.params.tenkanPeriod || 9,
          indConfig.params.kijunPeriod || 26,
          indConfig.params.senkouBPeriod || 52,
          indConfig.params.displacement || 26
        );
        indicatorValues.Ichimoku_Tenkan = ichimoku.tenkan;
        indicatorValues.Ichimoku_Kijun = ichimoku.kijun;
        indicatorValues.Ichimoku_SenkouA = ichimoku.senkouA;
        indicatorValues.Ichimoku_SenkouB = ichimoku.senkouB;
        indicatorValues.Ichimoku_CloudTop = ichimoku.cloudTop;
        indicatorValues.Ichimoku_CloudBottom = ichimoku.cloudBottom;
        indicatorValues.Ichimoku_CloudBullish = ichimoku.cloudBullish.map(b => b ? 1 : 0);
        break;
      }
      case "VWAPBands": {
        const vwapBands = indicators.VWAPBands(candles);
        indicatorValues.VWAPBands_VWAP = vwapBands.vwap;
        indicatorValues.VWAPBands_Upper1 = vwapBands.upperBand1;
        indicatorValues.VWAPBands_Lower1 = vwapBands.lowerBand1;
        indicatorValues.VWAPBands_Upper2 = vwapBands.upperBand2;
        indicatorValues.VWAPBands_Lower2 = vwapBands.lowerBand2;
        indicatorValues.VWAPBands_Upper3 = vwapBands.upperBand3;
        indicatorValues.VWAPBands_Lower3 = vwapBands.lowerBand3;
        break;
      }
      case "RollingVWAP": {
        indicatorValues.RollingVWAP = indicators.RollingVWAP(candles, indConfig.params.period || 21);
        break;
      }
      case "MarketStructure": {
        const ms = indicators.MarketStructure(candles, indConfig.params.swingLookback || 5);
        indicatorValues.MS_Trend = ms.trend;
        indicatorValues.MS_BOS = ms.bos;
        indicatorValues.MS_CHoCH = ms.choch;
        indicatorValues.MS_LastSwingHigh = ms.lastSwingHigh;
        indicatorValues.MS_LastSwingLow = ms.lastSwingLow;
        break;
      }
      case "SqueezeMomentum": {
        const squeeze = indicators.SqueezeMomentum(
          candles,
          indConfig.params.bbPeriod || 20,
          indConfig.params.bbMult || 2,
          indConfig.params.kcPeriod || 20,
          indConfig.params.kcMult || 1.5
        );
        indicatorValues.Squeeze_InSqueeze = squeeze.squeeze.map(s => s ? 1 : 0);
        indicatorValues.Squeeze_Momentum = squeeze.momentum;
        break;
      }
      case "TrendIntensityIndex": {
        indicatorValues.TII = indicators.TrendIntensityIndex(closes, indConfig.params.period || 14);
        break;
      }
      case "PriceMomentumScore": {
        indicatorValues.PMS = indicators.PriceMomentumScore(candles, indConfig.params.period || 14);
        break;
      }
      case "AccumulationDistribution": {
        indicatorValues.AD = indicators.AccumulationDistribution(candles);
        break;
      }
    }
  }

  // Generate signals based on strategy type
  const strategyBase = config.id.split("_").slice(0, 2).join("_");

  for (let i = 2; i < candles.length; i++) {
    const price = closes[i];
    const prevPrice = closes[i - 1];
    const volume = candles[i].volume;

    switch (strategyBase) {
      case "supertrend_trend": {
        const dir = indicatorValues.SupertrendDirection?.[i];
        const prevDir = indicatorValues.SupertrendDirection?.[i - 1];
        if (dir === 1 && prevDir === -1) signals[i] = "buy";
        else if (dir === -1 && prevDir === 1) signals[i] = "sell";
        break;
      }

      case "donchian_breakout": {
        const upper = indicatorValues.Donchian_Upper?.[i - 1]; // Use previous candle's channel
        const lower = indicatorValues.Donchian_Lower?.[i - 1];
        const adx = indicatorValues.ADX?.[i];
        const threshold = config.params.adxThreshold || 20;

        if (upper && lower && adx > threshold) {
          // Breakout on close above previous high channel
          if (price > upper && prevPrice <= upper) signals[i] = "buy";
          else if (price < lower && prevPrice >= lower) signals[i] = "sell";
        }
        break;
      }

      case "ema_rsi": {
        const fastEMA = indicatorValues[`EMA_${config.params.fastEMA}`]?.[i];
        const slowEMA = indicatorValues[`EMA_${config.params.slowEMA}`]?.[i];
        const rsi = indicatorValues.RSI?.[i];
        const prevRsi = indicatorValues.RSI?.[i - 1];
        const threshold = config.params.rsiThreshold || 50;

        if (fastEMA && slowEMA && rsi !== undefined && prevRsi !== undefined) {
          // Only trade with the trend
          if (fastEMA > slowEMA && prevRsi < threshold && rsi >= threshold) {
            signals[i] = "buy";
          } else if (fastEMA < slowEMA && prevRsi > threshold && rsi <= threshold) {
            signals[i] = "sell";
          }
        }
        break;
      }

      case "keltner_volume": {
        const upper = indicatorValues.Keltner_Upper?.[i];
        const lower = indicatorValues.Keltner_Lower?.[i];
        const volSMA = indicatorValues.VolumeSMA?.[i];
        const volMult = config.params.volumeMultiplier || 1.2;

        if (upper && lower && volSMA && volume > volSMA * volMult) {
          if (price > upper && prevPrice <= upper) signals[i] = "buy";
          else if (price < lower && prevPrice >= lower) signals[i] = "sell";
        }
        break;
      }

      case "macd_histogram": {
        const histogram = indicatorValues.MACD_Histogram?.[i];
        const prevHistogram = indicatorValues.MACD_Histogram?.[i - 1];
        const ema50 = indicatorValues.EMA_50?.[i];

        if (histogram !== undefined && prevHistogram !== undefined && ema50) {
          // MACD histogram flip with trend filter
          if (histogram > 0 && prevHistogram <= 0 && price > ema50) {
            signals[i] = "buy";
          } else if (histogram < 0 && prevHistogram >= 0 && price < ema50) {
            signals[i] = "sell";
          }
        }
        break;
      }

      case "adx_di": {
        const adx = indicatorValues.ADX?.[i];
        const plusDI = indicatorValues.PlusDI?.[i];
        const minusDI = indicatorValues.MinusDI?.[i];
        const prevPlusDI = indicatorValues.PlusDI?.[i - 1];
        const prevMinusDI = indicatorValues.MinusDI?.[i - 1];
        const threshold = config.params.adxThreshold || 20;

        if (adx > threshold && plusDI && minusDI && prevPlusDI && prevMinusDI) {
          if (plusDI > minusDI && prevPlusDI <= prevMinusDI) signals[i] = "buy";
          else if (minusDI > plusDI && prevMinusDI <= prevPlusDI) signals[i] = "sell";
        }
        break;
      }

      case "hull_ma": {
        const fastHMA = indicatorValues[`HMA_${config.params.fastHMA}`]?.[i];
        const slowHMA = indicatorValues[`HMA_${config.params.slowHMA}`]?.[i];
        const prevFastHMA = indicatorValues[`HMA_${config.params.fastHMA}`]?.[i - 1];
        const prevSlowHMA = indicatorValues[`HMA_${config.params.slowHMA}`]?.[i - 1];

        if (fastHMA && slowHMA && prevFastHMA && prevSlowHMA) {
          if (fastHMA > slowHMA && prevFastHMA <= prevSlowHMA) signals[i] = "buy";
          else if (fastHMA < slowHMA && prevFastHMA >= prevSlowHMA) signals[i] = "sell";
        }
        break;
      }

      case "parabolic_sar": {
        const sarTrend = indicatorValues.SAR_Trend?.[i];
        const prevSarTrend = indicatorValues.SAR_Trend?.[i - 1];
        const adx = indicatorValues.ADX?.[i];
        const threshold = config.params.adxThreshold || 20;

        if (sarTrend && prevSarTrend && adx > threshold) {
          if (sarTrend === 1 && prevSarTrend === -1) signals[i] = "buy";
          else if (sarTrend === -1 && prevSarTrend === 1) signals[i] = "sell";
        }
        break;
      }

      case "triple_screen": {
        const ema13 = indicatorValues.EMA_13?.[i];
        const ema26 = indicatorValues.EMA_26?.[i];
        const histogram = indicatorValues.MACD_Histogram?.[i];
        const prevHistogram = indicatorValues.MACD_Histogram?.[i - 1];
        const stochRSI = indicatorValues.StochRSI?.[i];

        if (ema13 && ema26 && histogram !== undefined && prevHistogram !== undefined && stochRSI !== undefined) {
          // Long: trend up, histogram rising, stochRSI oversold
          if (ema13 > ema26 && histogram > prevHistogram && stochRSI < 30) {
            signals[i] = "buy";
          }
          // Short: trend down, histogram falling, stochRSI overbought
          else if (ema13 < ema26 && histogram < prevHistogram && stochRSI > 70) {
            signals[i] = "sell";
          }
        }
        break;
      }

      case "momentum_surge": {
        const rsi = indicatorValues.RSI?.[i];
        const adx = indicatorValues.ADX?.[i];
        const ema20 = indicatorValues.EMA_20?.[i];

        if (rsi !== undefined && adx && ema20) {
          const rsiLong = config.params.rsiLong || 55;
          const rsiShort = config.params.rsiShort || 45;
          const adxThreshold = config.params.adxThreshold || 25;

          if (rsi > rsiLong && adx > adxThreshold && price > ema20) {
            signals[i] = "buy";
          } else if (rsi < rsiShort && adx > adxThreshold && price < ema20) {
            signals[i] = "sell";
          }
        }
        break;
      }

      case "bollinger_squeeze": {
        const bbUpper = indicatorValues.BB_Upper?.[i];
        const bbLower = indicatorValues.BB_Lower?.[i];
        const keltUpper = indicatorValues.Keltner_Upper?.[i];
        const keltLower = indicatorValues.Keltner_Lower?.[i];

        if (bbUpper && bbLower && keltUpper && keltLower) {
          // Squeeze: BB inside Keltner
          const isSqueezing = bbUpper < keltUpper && bbLower > keltLower;
          const prevBBUpper = indicatorValues.BB_Upper?.[i - 1];
          const prevKeltUpper = indicatorValues.Keltner_Upper?.[i - 1];
          const prevBBLower = indicatorValues.BB_Lower?.[i - 1];
          const prevKeltLower = indicatorValues.Keltner_Lower?.[i - 1];
          const wasSqueezing = prevBBUpper && prevKeltUpper && prevBBLower && prevKeltLower &&
            prevBBUpper < prevKeltUpper && prevBBLower > prevKeltLower;

          // Breakout from squeeze
          if (wasSqueezing || isSqueezing) {
            if (price > bbUpper && prevPrice <= prevBBUpper!) signals[i] = "buy";
            else if (price < bbLower && prevPrice >= prevBBLower!) signals[i] = "sell";
          }
        }
        break;
      }

      case "cmf_price": {
        const cmf = indicatorValues.CMF?.[i];
        const ema21 = indicatorValues.EMA_21?.[i];
        const prevEma21 = indicatorValues.EMA_21?.[i - 1];
        const threshold = config.params.cmfThreshold || 0.1;

        if (cmf !== undefined && ema21 && prevEma21) {
          if (cmf > threshold && price > ema21 && prevPrice <= prevEma21) {
            signals[i] = "buy";
          } else if (cmf < -threshold && price < ema21 && prevPrice >= prevEma21) {
            signals[i] = "sell";
          }
        }
        break;
      }

      case "fast_ema": {
        const ema5 = indicatorValues.EMA_5?.[i];
        const ema13 = indicatorValues.EMA_13?.[i];
        const prevEma5 = indicatorValues.EMA_5?.[i - 1];
        const prevEma13 = indicatorValues.EMA_13?.[i - 1];
        const rsi = indicatorValues.RSI?.[i];

        if (ema5 && ema13 && prevEma5 && prevEma13 && rsi !== undefined) {
          // EMA crossover with RSI filter
          if (ema5 > ema13 && prevEma5 <= prevEma13 && rsi > 50) {
            signals[i] = "buy";
          } else if (ema5 < ema13 && prevEma5 >= prevEma13 && rsi < 50) {
            signals[i] = "sell";
          }
        }
        break;
      }

      case "momentum_burst": {
        const rsi = indicatorValues.RSI?.[i];
        const adx = indicatorValues.ADX?.[i];
        const ema10 = indicatorValues.EMA_10?.[i];

        if (rsi !== undefined && adx && ema10) {
          const rsiLong = config.params.rsiLong || 60;
          const rsiShort = config.params.rsiShort || 40;
          const adxThreshold = config.params.adxThreshold || 30;

          if (rsi > rsiLong && adx > adxThreshold && price > ema10) {
            signals[i] = "buy";
          } else if (rsi < rsiShort && adx > adxThreshold && price < ema10) {
            signals[i] = "sell";
          }
        }
        break;
      }

      case "vwap_bounce": {
        const vwap = indicatorValues.VWAP?.[i];
        const prevVwap = indicatorValues.VWAP?.[i - 1];
        const rsi = indicatorValues.RSI?.[i];

        if (vwap && prevVwap && rsi !== undefined) {
          // Price crosses VWAP with RSI filter
          if (price > vwap && prevPrice <= prevVwap && rsi > 45) {
            signals[i] = "buy";
          } else if (price < vwap && prevPrice >= prevVwap && rsi < 55) {
            signals[i] = "sell";
          }
        }
        break;
      }

      case "range_breakout": {
        const atr = indicatorValues.ATR?.[i];
        const ema20 = indicatorValues.EMA_20?.[i];
        const multiplier = config.params.atrMultiplier || 1.5;

        if (atr && ema20) {
          const upperBand = ema20 + multiplier * atr;
          const lowerBand = ema20 - multiplier * atr;

          if (price > upperBand && prevPrice <= ema20 + multiplier * (indicatorValues.ATR?.[i - 1] || atr)) {
            signals[i] = "buy";
          } else if (price < lowerBand && prevPrice >= ema20 - multiplier * (indicatorValues.ATR?.[i - 1] || atr)) {
            signals[i] = "sell";
          }
        }
        break;
      }

      case "williams_r": {
        const willR = indicatorValues.WilliamsR?.[i];
        const prevWillR = indicatorValues.WilliamsR?.[i - 1];
        const ema20 = indicatorValues.EMA_20?.[i];

        if (willR !== undefined && prevWillR !== undefined && ema20) {
          const oversold = config.params.oversold || -80;
          const overbought = config.params.overbought || -20;

          // Cross from oversold with trend filter
          if (willR > oversold && prevWillR <= oversold && price > ema20) {
            signals[i] = "buy";
          } else if (willR < overbought && prevWillR >= overbought && price < ema20) {
            signals[i] = "sell";
          }
        }
        break;
      }

      // ============ SCALPING STRATEGIES ============

      case "rsi_bounce": {
        const rsi = indicatorValues.RSI?.[i];
        const prevRsi = indicatorValues.RSI?.[i - 1];
        const oversold = config.params.oversold || 25;
        const overbought = config.params.overbought || 75;

        if (rsi !== undefined && prevRsi !== undefined) {
          // RSI bounces from extremes (no trend filter - pure mean reversion)
          if (prevRsi < oversold && rsi > prevRsi) {
            signals[i] = "buy";
          } else if (prevRsi > overbought && rsi < prevRsi) {
            signals[i] = "sell";
          }
        }
        break;
      }

      case "bb_bounce": {
        const upper = indicatorValues.BB_Upper?.[i];
        const lower = indicatorValues.BB_Lower?.[i];
        const prevUpper = indicatorValues.BB_Upper?.[i - 1];
        const prevLower = indicatorValues.BB_Lower?.[i - 1];

        if (upper && lower && prevUpper && prevLower) {
          // Price touches band and reverses (mean reversion)
          if (prevPrice <= prevLower && price > lower) {
            signals[i] = "buy"; // Bounced off lower band
          } else if (prevPrice >= prevUpper && price < upper) {
            signals[i] = "sell"; // Bounced off upper band
          }
        }
        break;
      }

      case "micro_ema": {
        const fast = indicatorValues[`EMA_${config.params.fastEMA || 3}`]?.[i];
        const slow = indicatorValues[`EMA_${config.params.slowEMA || 8}`]?.[i];
        const prevFast = indicatorValues[`EMA_${config.params.fastEMA || 3}`]?.[i - 1];
        const prevSlow = indicatorValues[`EMA_${config.params.slowEMA || 8}`]?.[i - 1];

        if (fast && slow && prevFast && prevSlow) {
          // Simple crossover, no filters
          if (fast > slow && prevFast <= prevSlow) signals[i] = "buy";
          else if (fast < slow && prevFast >= prevSlow) signals[i] = "sell";
        }
        break;
      }

      case "stoch_scalp": {
        const stoch = indicatorValues.StochRSI?.[i];
        const prevStoch = indicatorValues.StochRSI?.[i - 1];
        const oversold = config.params.oversold || 20;
        const overbought = config.params.overbought || 80;

        if (stoch !== undefined && prevStoch !== undefined) {
          // Cross from extremes
          if (stoch > oversold && prevStoch <= oversold) signals[i] = "buy";
          else if (stoch < overbought && prevStoch >= overbought) signals[i] = "sell";
        }
        break;
      }

      case "candle_scalp": {
        // Price action patterns
        const open = candles[i].open;
        const high = candles[i].high;
        const low = candles[i].low;
        const close = candles[i].close;
        const prevOpen = candles[i - 1].open;
        const prevClose = candles[i - 1].close;
        const prevHigh = candles[i - 1].high;
        const prevLow = candles[i - 1].low;

        const bodySize = Math.abs(close - open);
        const prevBodySize = Math.abs(prevClose - prevOpen);
        const upperWick = high - Math.max(open, close);
        const lowerWick = Math.min(open, close) - low;

        // Bullish engulfing
        if (prevClose < prevOpen && close > open &&
            open <= prevClose && close >= prevOpen && bodySize > prevBodySize) {
          signals[i] = "buy";
        }
        // Bearish engulfing
        else if (prevClose > prevOpen && close < open &&
                 open >= prevClose && close <= prevOpen && bodySize > prevBodySize) {
          signals[i] = "sell";
        }
        // Hammer (bullish)
        else if (lowerWick > bodySize * 2 && upperWick < bodySize * 0.5) {
          signals[i] = "buy";
        }
        // Shooting star (bearish)
        else if (upperWick > bodySize * 2 && lowerWick < bodySize * 0.5) {
          signals[i] = "sell";
        }
        break;
      }

      case "volatility_scalp": {
        const atr = indicatorValues.ATR?.[i];
        const prevAtr = indicatorValues.ATR?.[i - 1];
        const ema5 = indicatorValues.EMA_5?.[i];
        const multiplier = config.params.atrMultiplier || 1.5;

        if (atr && prevAtr && ema5) {
          // ATR spike = volatility expansion
          if (atr > prevAtr * multiplier) {
            if (price > ema5) signals[i] = "buy";
            else if (price < ema5) signals[i] = "sell";
          }
        }
        break;
      }

      case "macd_zero": {
        const macd = indicatorValues.MACD?.[i];
        const prevMacd = indicatorValues.MACD?.[i - 1];

        if (macd !== undefined && prevMacd !== undefined) {
          // MACD crosses zero line
          if (macd > 0 && prevMacd <= 0) signals[i] = "buy";
          else if (macd < 0 && prevMacd >= 0) signals[i] = "sell";
        }
        break;
      }

      // ============ V3 AGGRESSIVE STRATEGIES ============

      case "rsi_momentum": {
        const rsi = indicatorValues.RSI?.[i];
        const ema = indicatorValues[`EMA_${config.params.emaPeriod || 21}`]?.[i];
        const adx = indicatorValues.ADX?.[i];
        const rsiLong = config.params.rsiLong || 65;
        const rsiShort = config.params.rsiShort || 35;
        const adxThreshold = config.params.adxThreshold || 20;

        if (rsi !== undefined && ema && adx) {
          if (rsi > rsiLong && price > ema && adx > adxThreshold) {
            signals[i] = "buy";
          } else if (rsi < rsiShort && price < ema && adx > adxThreshold) {
            signals[i] = "sell";
          }
        }
        break;
      }

      case "breakout_explosion": {
        const atr = indicatorValues.ATR?.[i];
        const prevAtr = indicatorValues.ATR?.[i - 1];
        const upper = indicatorValues.Donchian_Upper?.[i - 1];
        const lower = indicatorValues.Donchian_Lower?.[i - 1];
        const expansion = config.params.atrExpansion || 1.3;

        if (atr && prevAtr && upper && lower) {
          const atrExpanding = atr > prevAtr * expansion;
          if (price > upper && atrExpanding) {
            signals[i] = "buy";
          } else if (price < lower && atrExpanding) {
            signals[i] = "sell";
          }
        }
        break;
      }

      case "triple_momentum": {
        const rsi = indicatorValues.RSI?.[i];
        const macd = indicatorValues.MACD?.[i];
        const macdSignal = indicatorValues.MACD_Signal?.[i];
        const adx = indicatorValues.ADX?.[i];
        const rsiLong = config.params.rsiLong || 55;
        const rsiShort = config.params.rsiShort || 45;
        const adxThreshold = config.params.adxThreshold || 25;

        if (rsi !== undefined && macd !== undefined && macdSignal !== undefined && adx) {
          if (rsi > rsiLong && macd > macdSignal && adx > adxThreshold) {
            signals[i] = "buy";
          } else if (rsi < rsiShort && macd < macdSignal && adx > adxThreshold) {
            signals[i] = "sell";
          }
        }
        break;
      }

      case "volume_climax": {
        const volSMA = indicatorValues.VolumeSMA?.[i];
        const rsi = indicatorValues.RSI?.[i];
        const bbUpper = indicatorValues.BB_Upper?.[i];
        const bbLower = indicatorValues.BB_Lower?.[i];
        const volMult = config.params.volumeMultiplier || 2;
        const rsiOversold = config.params.rsiOversold || 30;
        const rsiOverbought = config.params.rsiOverbought || 70;

        if (volSMA && rsi !== undefined && bbUpper && bbLower) {
          const highVolume = volume > volSMA * volMult;
          if (highVolume && price <= bbLower && rsi < rsiOversold) {
            signals[i] = "buy";
          } else if (highVolume && price >= bbUpper && rsi > rsiOverbought) {
            signals[i] = "sell";
          }
        }
        break;
      }

      case "ema_ribbon": {
        const ema8 = indicatorValues.EMA_8?.[i];
        const ema13 = indicatorValues.EMA_13?.[i];
        const ema21 = indicatorValues.EMA_21?.[i];
        const ema34 = indicatorValues.EMA_34?.[i];
        const prevEma8 = indicatorValues.EMA_8?.[i - 1];
        const prevEma13 = indicatorValues.EMA_13?.[i - 1];
        const prevEma21 = indicatorValues.EMA_21?.[i - 1];
        const prevEma34 = indicatorValues.EMA_34?.[i - 1];

        if (ema8 && ema13 && ema21 && ema34 && prevEma8 && prevEma13 && prevEma21 && prevEma34) {
          // Perfect bullish alignment
          const bullishNow = ema8 > ema13 && ema13 > ema21 && ema21 > ema34;
          const wasBullish = prevEma8 > prevEma13 && prevEma13 > prevEma21 && prevEma21 > prevEma34;
          // Perfect bearish alignment
          const bearishNow = ema8 < ema13 && ema13 < ema21 && ema21 < ema34;
          const wasBearish = prevEma8 < prevEma13 && prevEma13 < prevEma21 && prevEma21 < prevEma34;

          if (bullishNow && !wasBullish) signals[i] = "buy";
          else if (bearishNow && !wasBearish) signals[i] = "sell";
        }
        break;
      }

      case "roc_spike": {
        const roc = indicatorValues.ROC?.[i];
        const ema20 = indicatorValues.EMA_20?.[i];
        const threshold = config.params.threshold || 2;

        if (roc !== undefined && ema20) {
          if (roc > threshold && price > ema20) {
            signals[i] = "buy";
          } else if (roc < -threshold && price < ema20) {
            signals[i] = "sell";
          }
        }
        break;
      }

      case "mfi_momentum": {
        const mfi = indicatorValues.MFI?.[i];
        const prevMfi = indicatorValues.MFI?.[i - 1];
        const ema20 = indicatorValues.EMA_20?.[i];

        if (mfi !== undefined && prevMfi !== undefined && ema20) {
          // MFI crosses 50 with trend filter
          if (mfi > 50 && prevMfi <= 50 && price > ema20) {
            signals[i] = "buy";
          } else if (mfi < 50 && prevMfi >= 50 && price < ema20) {
            signals[i] = "sell";
          }
        }
        break;
      }

      case "obv_breakout": {
        const obv = indicatorValues.OBV?.[i];
        const prevObv = indicatorValues.OBV?.[i - 1];
        const upper = indicatorValues.Donchian_Upper?.[i - 1];
        const lower = indicatorValues.Donchian_Lower?.[i - 1];

        if (obv !== undefined && prevObv !== undefined && upper && lower) {
          const obvRising = obv > prevObv;
          const obvFalling = obv < prevObv;

          if (price > upper && obvRising) {
            signals[i] = "buy";
          } else if (price < lower && obvFalling) {
            signals[i] = "sell";
          }
        }
        break;
      }

      case "cci_momentum": {
        const cci = indicatorValues.CCI?.[i];
        const prevCci = indicatorValues.CCI?.[i - 1];
        const ema50 = indicatorValues.EMA_50?.[i];
        const threshold = config.params.cciThreshold || 100;

        if (cci !== undefined && prevCci !== undefined && ema50) {
          // CCI crosses threshold with trend filter
          if (cci > threshold && prevCci <= threshold && price > ema50) {
            signals[i] = "buy";
          } else if (cci < -threshold && prevCci >= -threshold && price < ema50) {
            signals[i] = "sell";
          }
        }
        break;
      }

      case "channel_position": {
        const chanPos = indicatorValues.PriceChannelPosition?.[i];
        const adx = indicatorValues.ADX?.[i];
        const lowThresh = config.params.lowThreshold || 20;
        const highThresh = config.params.highThreshold || 80;
        const adxRangeThresh = config.params.adxRangeThreshold || 25;

        if (chanPos !== undefined && adx) {
          // Only trade in ranging markets (low ADX)
          if (adx < adxRangeThresh) {
            if (chanPos < lowThresh) {
              signals[i] = "buy";
            } else if (chanPos > highThresh) {
              signals[i] = "sell";
            }
          }
        }
        break;
      }

      // ============ V4 STRATEGY SIGNALS ============

      case "vwap_macd": {
        const vwap = indicatorValues.VWAP?.[i];
        const macd = indicatorValues.MACD?.[i];
        const macdSignal = indicatorValues.MACD_Signal?.[i];
        const rsi = indicatorValues.RSI?.[i];
        const rsiOversold = config.params.rsiOversold || 30;
        const rsiOverbought = config.params.rsiOverbought || 70;

        if (vwap && macd !== undefined && macdSignal !== undefined && rsi !== undefined) {
          // Only trade when RSI is not at extremes (avoid buying tops/selling bottoms)
          if (rsi > rsiOversold && rsi < rsiOverbought) {
            if (price > vwap && macd > macdSignal) {
              signals[i] = "buy";
            } else if (price < vwap && macd < macdSignal) {
              signals[i] = "sell";
            }
          }
        }
        break;
      }

      case "rsi_bb": {
        const rsi = indicatorValues.RSI?.[i];
        const bbUpper = indicatorValues.BB_Upper?.[i];
        const bbLower = indicatorValues.BB_Lower?.[i];
        const rsiOversold = config.params.rsiOversold || 30;
        const rsiOverbought = config.params.rsiOverbought || 70;

        if (rsi !== undefined && bbUpper && bbLower) {
          // Confluence: RSI extreme + price at BB band
          if (rsi < rsiOversold && price <= bbLower) {
            signals[i] = "buy";
          } else if (rsi > rsiOverbought && price >= bbUpper) {
            signals[i] = "sell";
          }
        }
        break;
      }

      case "fast_ema": {
        const ema3 = indicatorValues.EMA_3?.[i];
        const ema8 = indicatorValues.EMA_8?.[i];
        const ema21 = indicatorValues.EMA_21?.[i];
        const prevEma3 = indicatorValues.EMA_3?.[i - 1];
        const prevEma8 = indicatorValues.EMA_8?.[i - 1];
        const prevEma21 = indicatorValues.EMA_21?.[i - 1];
        const rsi = indicatorValues.RSI?.[i];

        if (ema3 && ema8 && ema21 && prevEma3 && prevEma8 && prevEma21 && rsi !== undefined) {
          // EMA stack alignment with RSI filter
          const bullishStack = ema3 > ema8 && ema8 > ema21;
          const bearishStack = ema3 < ema8 && ema8 < ema21;
          const wasBullish = prevEma3 > prevEma8 && prevEma8 > prevEma21;
          const wasBearish = prevEma3 < prevEma8 && prevEma8 < prevEma21;

          if (bullishStack && !wasBullish && rsi > 50) {
            signals[i] = "buy";
          } else if (bearishStack && !wasBearish && rsi < 50) {
            signals[i] = "sell";
          }
        }
        break;
      }

      case "atr_optimal": {
        const atr = indicatorValues.ATR?.[i];
        const ema = indicatorValues[`EMA_${config.params.emaPeriod || 20}`]?.[i];
        const rsi = indicatorValues.RSI?.[i];
        const prevRsi = indicatorValues.RSI?.[i - 1];
        const atrMinPct = config.params.atrMinPct || 0.5;
        const atrMaxPct = config.params.atrMaxPct || 3.0;

        if (atr && ema && rsi !== undefined && prevRsi !== undefined) {
          // Calculate ATR as % of price
          const atrPct = (atr / price) * 100;
          const optimalVolatility = atrPct >= atrMinPct && atrPct <= atrMaxPct;

          if (optimalVolatility) {
            // RSI crosses 50
            if (price > ema && prevRsi < 50 && rsi >= 50) {
              signals[i] = "buy";
            } else if (price < ema && prevRsi > 50 && rsi <= 50) {
              signals[i] = "sell";
            }
          }
        }
        break;
      }

      case "sr_bounce": {
        const upper = indicatorValues.Donchian_Upper?.[i];
        const lower = indicatorValues.Donchian_Lower?.[i];
        const rsi = indicatorValues.RSI?.[i];
        const adx = indicatorValues.ADX?.[i];
        const nearPct = config.params.nearPct || 5;

        if (upper && lower && rsi !== undefined && adx) {
          const range = upper - lower;
          const nearLow = lower + (range * nearPct / 100);
          const nearHigh = upper - (range * nearPct / 100);

          // Only trade in ranging markets
          if (adx < 25) {
            if (price <= nearLow && rsi < 35) {
              signals[i] = "buy";
            } else if (price >= nearHigh && rsi > 65) {
              signals[i] = "sell";
            }
          }
        }
        break;
      }

      case "macd_vol": {
        const macd = indicatorValues.MACD?.[i];
        const macdSignal = indicatorValues.MACD_Signal?.[i];
        const prevMacd = indicatorValues.MACD?.[i - 1];
        const prevMacdSignal = indicatorValues.MACD_Signal?.[i - 1];
        const volSMA = indicatorValues.VolumeSMA?.[i];
        const ema50 = indicatorValues.EMA_50?.[i];
        const volMult = config.params.volumeMultiplier || 1.2;

        if (macd !== undefined && macdSignal !== undefined && 
            prevMacd !== undefined && prevMacdSignal !== undefined && 
            volSMA && ema50) {
          const highVolume = volume > volSMA * volMult;

          // MACD crosses signal with volume confirmation
          if (highVolume) {
            if (macd > macdSignal && prevMacd <= prevMacdSignal && price > ema50) {
              signals[i] = "buy";
            } else if (macd < macdSignal && prevMacd >= prevMacdSignal && price < ema50) {
              signals[i] = "sell";
            }
          }
        }
        break;
      }

      case "stoch_macd": {
        const stoch = indicatorValues.StochRSI?.[i];
        const prevStoch = indicatorValues.StochRSI?.[i - 1];
        const macdHist = indicatorValues.MACD_Histogram?.[i];
        const stochOversold = config.params.stochOversold || 20;
        const stochOverbought = config.params.stochOverbought || 80;

        if (stoch !== undefined && prevStoch !== undefined && macdHist !== undefined) {
          // StochRSI crosses with MACD histogram confirmation
          if (stoch > stochOversold && prevStoch <= stochOversold && macdHist > 0) {
            signals[i] = "buy";
          } else if (stoch < stochOverbought && prevStoch >= stochOverbought && macdHist < 0) {
            signals[i] = "sell";
          }
        }
        break;
      }

      case "aggressive_momentum": {
        const rsi = indicatorValues.RSI?.[i];
        const ema5 = indicatorValues.EMA_5?.[i];
        const ema10 = indicatorValues.EMA_10?.[i];
        const rsiLong = config.params.rsiLong || 55;
        const rsiShort = config.params.rsiShort || 45;

        if (rsi !== undefined && ema5 && ema10) {
          // Aggressive momentum: RSI threshold + EMA trend
          if (rsi > rsiLong && ema5 > ema10) {
            signals[i] = "buy";
          } else if (rsi < rsiShort && ema5 < ema10) {
            signals[i] = "sell";
          }
        }
        break;
      }

      case "keltner_rsi": {
        const upper = indicatorValues.Keltner_Upper?.[i];
        const lower = indicatorValues.Keltner_Lower?.[i];
        const prevUpper = indicatorValues.Keltner_Upper?.[i - 1];
        const prevLower = indicatorValues.Keltner_Lower?.[i - 1];
        const rsi = indicatorValues.RSI?.[i];

        if (upper && lower && prevUpper && prevLower && rsi !== undefined) {
          // Keltner breakout with RSI momentum filter
          if (price > upper && prevPrice <= prevUpper && rsi > 50) {
            signals[i] = "buy";
          } else if (price < lower && prevPrice >= prevLower && rsi < 50) {
            signals[i] = "sell";
          }
        }
        break;
      }

      case "double_pattern": {
        const rsi = indicatorValues.RSI?.[i];
        const prevRsi = indicatorValues.RSI?.[i - 1];
        const atr = indicatorValues.ATR?.[i];
        const prevAtr = indicatorValues.ATR?.[i - 1];
        const lower = indicatorValues.Donchian_Lower?.[i];
        const upper = indicatorValues.Donchian_Upper?.[i];
        const prevLower = indicatorValues.Donchian_Lower?.[i - 1];
        const prevUpper = indicatorValues.Donchian_Upper?.[i - 1];

        if (rsi !== undefined && prevRsi !== undefined && atr && prevAtr &&
            lower && upper && prevLower && prevUpper) {
          // Look for RSI divergence at price extremes with low volatility
          const atrDecreasing = atr < prevAtr * 0.9;
          const nearLow = price <= lower * 1.02;
          const nearHigh = price >= upper * 0.98;

          // Bullish divergence: price makes new low but RSI doesn't
          if (nearLow && atrDecreasing && rsi > prevRsi) {
            signals[i] = "buy";
          }
          // Bearish divergence: price makes new high but RSI doesn't
          else if (nearHigh && atrDecreasing && rsi < prevRsi) {
            signals[i] = "sell";
          }
        }
        break;
      }

      // ============ V5 STRATEGY SIGNALS ============

      case "double_supertrend": {
        // Need to handle two Supertrend indicators
        const fastDir = indicatorValues.SupertrendDirection?.[i];
        const prevFastDir = indicatorValues.SupertrendDirection?.[i - 1];
        // For slow Supertrend, we'll check trend direction based on price vs supertrend
        const fastTrend = indicatorValues.Supertrend?.[i];

        if (fastDir !== undefined && prevFastDir !== undefined && fastTrend) {
          // When fast Supertrend flips bullish AND price is above trend = buy
          if (fastDir === 1 && prevFastDir === -1 && price > fastTrend) {
            signals[i] = "buy";
          }
          // When fast Supertrend flips bearish AND price is below trend = sell
          else if (fastDir === -1 && prevFastDir === 1 && price < fastTrend) {
            signals[i] = "sell";
          }
        }
        break;
      }

      case "elder_impulse": {
        const emaPeriod = config.params.emaPeriod || 13;
        const ema = indicatorValues[`EMA_${emaPeriod}`]?.[i];
        const prevEma = indicatorValues[`EMA_${emaPeriod}`]?.[i - 1];
        const histogram = indicatorValues.MACD_Histogram?.[i];
        const prevHistogram = indicatorValues.MACD_Histogram?.[i - 1];

        if (ema && prevEma && histogram !== undefined && prevHistogram !== undefined) {
          const emaRising = ema > prevEma;
          const emaFalling = ema < prevEma;
          const histRising = histogram > prevHistogram;
          const histFalling = histogram < prevHistogram;

          // Green bar: both rising - BUY on transition to green
          if (emaRising && histRising && !(prevEma > indicatorValues[`EMA_${emaPeriod}`]?.[i - 2]! && prevHistogram > indicatorValues.MACD_Histogram?.[i - 2]!)) {
            signals[i] = "buy";
          }
          // Red bar: both falling - SELL on transition to red
          else if (emaFalling && histFalling && !(prevEma < indicatorValues[`EMA_${emaPeriod}`]?.[i - 2]! && prevHistogram < indicatorValues.MACD_Histogram?.[i - 2]!)) {
            signals[i] = "sell";
          }
        }
        break;
      }

      case "hull_cci": {
        const fastHMA = config.params.fastHMA || 16;
        const slowHMA = config.params.slowHMA || 21;
        const hmaFast = indicatorValues[`HMA_${fastHMA}`]?.[i];
        const hmaSlow = indicatorValues[`HMA_${slowHMA}`]?.[i];
        const prevHmaFast = indicatorValues[`HMA_${fastHMA}`]?.[i - 1];
        const prevHmaSlow = indicatorValues[`HMA_${slowHMA}`]?.[i - 1];
        const cci = indicatorValues.CCI?.[i];
        const cciThreshold = config.params.cciThreshold || 100;

        if (hmaFast && hmaSlow && prevHmaFast && prevHmaSlow && cci !== undefined) {
          // HMA cross + CCI confirmation
          if (hmaFast > hmaSlow && prevHmaFast <= prevHmaSlow && cci > cciThreshold) {
            signals[i] = "buy";
          } else if (hmaFast < hmaSlow && prevHmaFast >= prevHmaSlow && cci < -cciThreshold) {
            signals[i] = "sell";
          }
        }
        break;
      }

      case "rsi_bb": {
        const rsi = indicatorValues.RSI?.[i];
        const bbUpper = indicatorValues.BB_Upper?.[i];
        const bbLower = indicatorValues.BB_Lower?.[i];
        const volSMA = indicatorValues.VolumeSMA?.[i];
        const volMult = config.params.volumeMultiplier || 1.2;

        if (rsi !== undefined && bbUpper && bbLower && volSMA) {
          const highVolume = volume > volSMA * volMult;
          // RSI oversold + price at lower BB + volume confirmation
          if (rsi < 30 && price <= bbLower && highVolume) {
            signals[i] = "buy";
          } else if (rsi > 70 && price >= bbUpper && highVolume) {
            signals[i] = "sell";
          }
        }
        break;
      }

      case "triple_ema": {
        const ema9 = indicatorValues.EMA_9?.[i];
        const ema21 = indicatorValues.EMA_21?.[i];
        const ema55 = indicatorValues.EMA_55?.[i];
        const prevEma9 = indicatorValues.EMA_9?.[i - 1];
        const prevEma21 = indicatorValues.EMA_21?.[i - 1];
        const prevEma55 = indicatorValues.EMA_55?.[i - 1];
        const volSMA = indicatorValues.VolumeSMA?.[i];
        const volMult = config.params.volumeMultiplier || 1.3;

        if (ema9 && ema21 && ema55 && prevEma9 && prevEma21 && prevEma55 && volSMA) {
          const bullishStack = ema9 > ema21 && ema21 > ema55;
          const bearishStack = ema9 < ema21 && ema21 < ema55;
          const wasBullish = prevEma9 > prevEma21 && prevEma21 > prevEma55;
          const wasBearish = prevEma9 < prevEma21 && prevEma21 < prevEma55;
          const volumeSpike = volume > volSMA * volMult;

          if (bullishStack && !wasBullish && volumeSpike) {
            signals[i] = "buy";
          } else if (bearishStack && !wasBearish && volumeSpike) {
            signals[i] = "sell";
          }
        }
        break;
      }

      case "adx_momentum": {
        const adx = indicatorValues.ADX?.[i];
        const plusDI = indicatorValues.PlusDI?.[i];
        const minusDI = indicatorValues.MinusDI?.[i];
        const rsi = indicatorValues.RSI?.[i];
        const atr = indicatorValues.ATR?.[i];
        const ema20 = indicatorValues.EMA_20?.[i];
        const adxThreshold = config.params.adxThreshold || 30;
        const rsiLong = config.params.rsiLong || 55;
        const rsiShort = config.params.rsiShort || 45;

        if (adx && plusDI && minusDI && rsi !== undefined && atr && ema20) {
          // Strong trend + directional movement + RSI momentum + price breakout
          if (adx > adxThreshold && plusDI > minusDI && rsi > rsiLong && price > ema20 + atr) {
            signals[i] = "buy";
          } else if (adx > adxThreshold && minusDI > plusDI && rsi < rsiShort && price < ema20 - atr) {
            signals[i] = "sell";
          }
        }
        break;
      }

      case "mean_reversion": {
        const rsi = indicatorValues.RSI?.[i];
        const stochRSI = indicatorValues.StochRSI?.[i];
        const bbUpper = indicatorValues.BB_Upper?.[i];
        const bbLower = indicatorValues.BB_Lower?.[i];

        if (rsi !== undefined && stochRSI !== undefined && bbUpper && bbLower) {
          // Triple oversold confirmation
          if (price <= bbLower && rsi < 20 && stochRSI < 20) {
            signals[i] = "buy";
          } else if (price >= bbUpper && rsi > 80 && stochRSI > 80) {
            signals[i] = "sell";
          }
        }
        break;
      }

      case "macd_divergence": {
        const histogram = indicatorValues.MACD_Histogram?.[i];
        const ema50 = indicatorValues.EMA_50?.[i];
        const lookback = config.params.lookback || 10;

        if (histogram !== undefined && ema50) {
          // Look for divergence in price vs MACD histogram
          let priceNewLow = true;
          let histHigherLow = true;
          let priceNewHigh = true;
          let histLowerHigh = true;

          for (let j = 1; j <= Math.min(lookback, i - 2); j++) {
            const pastPrice = closes[i - j];
            const pastHist = indicatorValues.MACD_Histogram?.[i - j];

            if (pastPrice !== undefined && pastHist !== undefined) {
              if (price >= pastPrice) priceNewLow = false;
              if (histogram !== undefined && histogram <= pastHist) histHigherLow = false;
              if (price <= pastPrice) priceNewHigh = false;
              if (histogram !== undefined && histogram >= pastHist) histLowerHigh = false;
            }
          }

          // Bullish divergence: new price low but MACD histogram making higher lows
          if (priceNewLow && histHigherLow && price > ema50 * 0.95) {
            signals[i] = "buy";
          }
          // Bearish divergence: new price high but MACD histogram making lower highs
          else if (priceNewHigh && histLowerHigh && price < ema50 * 1.05) {
            signals[i] = "sell";
          }
        }
        break;
      }

      case "volatility_squeeze": {
        const bbUpper = indicatorValues.BB_Upper?.[i];
        const bbLower = indicatorValues.BB_Lower?.[i];
        const keltUpper = indicatorValues.Keltner_Upper?.[i];
        const keltLower = indicatorValues.Keltner_Lower?.[i];
        const prevBBUpper = indicatorValues.BB_Upper?.[i - 1];
        const prevBBLower = indicatorValues.BB_Lower?.[i - 1];
        const prevKeltUpper = indicatorValues.Keltner_Upper?.[i - 1];
        const prevKeltLower = indicatorValues.Keltner_Lower?.[i - 1];
        const rsi = indicatorValues.RSI?.[i];
        const macd = indicatorValues.MACD?.[i];
        const macdSignal = indicatorValues.MACD_Signal?.[i];

        if (bbUpper && bbLower && keltUpper && keltLower &&
            prevBBUpper && prevBBLower && prevKeltUpper && prevKeltLower &&
            rsi !== undefined && macd !== undefined && macdSignal !== undefined) {
          // Was in squeeze (BB inside Keltner), now released
          const wasSqueezing = prevBBUpper < prevKeltUpper && prevBBLower > prevKeltLower;
          const isSqueezing = bbUpper < keltUpper && bbLower > keltLower;
          const squeezeReleased = wasSqueezing && !isSqueezing;

          if (squeezeReleased) {
            if (rsi > 50 && macd > macdSignal) {
              signals[i] = "buy";
            } else if (rsi < 50 && macd < macdSignal) {
              signals[i] = "sell";
            }
          }
        }
        break;
      }

      case "momentum_wave": {
        const roc = indicatorValues.ROC?.[i];
        const mfi = indicatorValues.MFI?.[i];
        const ema21 = indicatorValues.EMA_21?.[i];
        const rocThreshold = config.params.rocThreshold || 2;
        const mfiLong = config.params.mfiLong || 60;
        const mfiShort = config.params.mfiShort || 40;

        if (roc !== undefined && mfi !== undefined && ema21) {
          // Momentum + money flow + trend
          if (roc > rocThreshold && mfi > mfiLong && price > ema21) {
            signals[i] = "buy";
          } else if (roc < -rocThreshold && mfi < mfiShort && price < ema21) {
            signals[i] = "sell";
          }
        }
        break;
      }

      case "trend_strength": {
        const adx = indicatorValues.ADX?.[i];
        const plusDI = indicatorValues.PlusDI?.[i];
        const minusDI = indicatorValues.MinusDI?.[i];
        const fastHMA = config.params.fastHMA || 9;
        const slowHMA = config.params.slowHMA || 21;
        const hmaFast = indicatorValues[`HMA_${fastHMA}`]?.[i];
        const hmaSlow = indicatorValues[`HMA_${slowHMA}`]?.[i];
        const prevHmaFast = indicatorValues[`HMA_${fastHMA}`]?.[i - 1];
        const prevHmaSlow = indicatorValues[`HMA_${slowHMA}`]?.[i - 1];
        const adxThreshold = config.params.adxThreshold || 35;

        if (adx && plusDI && minusDI && hmaFast && hmaSlow && prevHmaFast && prevHmaSlow) {
          // Only trade strongest trends
          if (adx > adxThreshold) {
            // HMA cross + DI confirmation
            if (hmaFast > hmaSlow && prevHmaFast <= prevHmaSlow && plusDI > minusDI) {
              signals[i] = "buy";
            } else if (hmaFast < hmaSlow && prevHmaFast >= prevHmaSlow && minusDI > plusDI) {
              signals[i] = "sell";
            }
          }
        }
        break;
      }

      // ============ V6 STRATEGIES SIGNAL LOGIC ============

      case "ema_9_21": {
        // Classic EMA crossover - research shows 2.65% avg gain on BTC
        const ema9 = indicatorValues.EMA_9?.[i];
        const ema21 = indicatorValues.EMA_21?.[i];
        const prevEma9 = indicatorValues.EMA_9?.[i - 1];
        const prevEma21 = indicatorValues.EMA_21?.[i - 1];

        if (ema9 && ema21 && prevEma9 && prevEma21) {
          // Golden cross
          if (ema9 > ema21 && prevEma9 <= prevEma21) {
            signals[i] = "buy";
          }
          // Death cross
          else if (ema9 < ema21 && prevEma9 >= prevEma21) {
            signals[i] = "sell";
          }
        }
        break;
      }

      case "macd_rsi": {
        // 73% win rate strategy - MACD 5/35/5 with RSI filter
        const macd = indicatorValues.MACD?.[i];
        const macdSignal = indicatorValues.MACD_Signal?.[i];
        const prevMacd = indicatorValues.MACD?.[i - 1];
        const prevMacdSignal = indicatorValues.MACD_Signal?.[i - 1];
        const rsi = indicatorValues.RSI?.[i];
        const rsiOversold = config.params.rsiOversold || 40;
        const rsiOverbought = config.params.rsiOverbought || 60;

        if (macd !== undefined && macdSignal !== undefined &&
            prevMacd !== undefined && prevMacdSignal !== undefined && rsi !== undefined) {
          // MACD bullish crossover with RSI filter (not overbought)
          if (macd > macdSignal && prevMacd <= prevMacdSignal && rsi < rsiOversold) {
            signals[i] = "buy";
          }
          // MACD bearish crossover with RSI filter (not oversold)
          else if (macd < macdSignal && prevMacd >= prevMacdSignal && rsi > rsiOverbought) {
            signals[i] = "sell";
          }
        }
        break;
      }

      case "rsi_mean": {
        // RSI 20/80 mean reversion with BB confirmation
        const rsi = indicatorValues.RSI?.[i];
        const prevRsi = indicatorValues.RSI?.[i - 1];
        const bbUpper = indicatorValues.BB_Upper?.[i];
        const bbLower = indicatorValues.BB_Lower?.[i];
        const rsiOversold = config.params.rsiOversold || 20;
        const rsiOverbought = config.params.rsiOverbought || 80;

        if (rsi !== undefined && prevRsi !== undefined && bbUpper && bbLower) {
          // Oversold + at lower BB + RSI turning up
          if (rsi < rsiOversold && price <= bbLower && rsi > prevRsi) {
            signals[i] = "buy";
          }
          // Overbought + at upper BB + RSI turning down
          else if (rsi > rsiOverbought && price >= bbUpper && rsi < prevRsi) {
            signals[i] = "sell";
          }
        }
        break;
      }

      case "atr_vol": {
        // ATR breakout with volume confirmation
        const atr = indicatorValues.ATR?.[i];
        const prevAtr = indicatorValues.ATR?.[i - 1];
        const ema20 = indicatorValues.EMA_20?.[i];
        const rsi = indicatorValues.RSI?.[i];
        const volSMA = indicatorValues.VolumeSMA?.[i];
        const volMult = config.params.volumeMultiplier || 1.5;

        if (atr && prevAtr && ema20 && rsi !== undefined && volSMA) {
          const volumeSpike = volume > volSMA * volMult;
          const atrExpanding = atr > prevAtr;

          // Price above EMA+ATR with volume spike and RSI confirmation
          if (price > ema20 + atr && volumeSpike && atrExpanding && rsi > 50) {
            signals[i] = "buy";
          }
          // Price below EMA-ATR with volume spike and RSI confirmation
          else if (price < ema20 - atr && volumeSpike && atrExpanding && rsi < 50) {
            signals[i] = "sell";
          }
        }
        break;
      }

      case "triple_ema": {
        // 9/21/200 EMA - trade with major trend only
        const ema9 = indicatorValues.EMA_9?.[i];
        const ema21 = indicatorValues.EMA_21?.[i];
        const ema200 = indicatorValues.EMA_200?.[i];
        const prevEma9 = indicatorValues.EMA_9?.[i - 1];
        const prevEma21 = indicatorValues.EMA_21?.[i - 1];

        if (ema9 && ema21 && ema200 && prevEma9 && prevEma21) {
          // Only long above 200 EMA, only short below
          if (price > ema200) {
            // Golden cross above 200 EMA
            if (ema9 > ema21 && prevEma9 <= prevEma21) {
              signals[i] = "buy";
            }
          } else if (price < ema200) {
            // Death cross below 200 EMA
            if (ema9 < ema21 && prevEma9 >= prevEma21) {
              signals[i] = "sell";
            }
          }
        }
        break;
      }

      case "rsi_50": {
        // RSI 50 crossover trend following
        const rsi = indicatorValues.RSI?.[i];
        const prevRsi = indicatorValues.RSI?.[i - 1];
        const ema50 = indicatorValues.EMA_50?.[i];

        if (rsi !== undefined && prevRsi !== undefined && ema50) {
          // RSI crosses above 50 with price above EMA50
          if (rsi > 50 && prevRsi <= 50 && price > ema50) {
            signals[i] = "buy";
          }
          // RSI crosses below 50 with price below EMA50
          else if (rsi < 50 && prevRsi >= 50 && price < ema50) {
            signals[i] = "sell";
          }
        }
        break;
      }

      case "fast_scalper": {
        // Fast scalper with RSI 7 and EMA 5/13
        const rsi = indicatorValues.RSI?.[i];
        const ema5 = indicatorValues.EMA_5?.[i];
        const ema13 = indicatorValues.EMA_13?.[i];
        const prevEma5 = indicatorValues.EMA_5?.[i - 1];
        const prevEma13 = indicatorValues.EMA_13?.[i - 1];

        if (rsi !== undefined && ema5 && ema13 && prevEma5 && prevEma13) {
          // EMA cross with RSI momentum filter
          if (ema5 > ema13 && prevEma5 <= prevEma13 && rsi > 50) {
            signals[i] = "buy";
          } else if (ema5 < ema13 && prevEma5 >= prevEma13 && rsi < 50) {
            signals[i] = "sell";
          }
        }
        break;
      }

      case "stoch_rsi": {
        // StochRSI + MACD combo - triple confirmation
        const stochRSI = indicatorValues.StochRSI?.[i];
        const histogram = indicatorValues.MACD_Histogram?.[i];
        const rsi = indicatorValues.RSI?.[i];
        const stochOversold = config.params.stochOversold || 30;
        const stochOverbought = config.params.stochOverbought || 70;

        if (stochRSI !== undefined && histogram !== undefined && rsi !== undefined) {
          // Oversold StochRSI + bullish MACD + RSI not extreme
          if (stochRSI < stochOversold && histogram > 0 && rsi > 40) {
            signals[i] = "buy";
          }
          // Overbought StochRSI + bearish MACD + RSI not extreme
          else if (stochRSI > stochOverbought && histogram < 0 && rsi < 60) {
            signals[i] = "sell";
          }
        }
        break;
      }

      case "volume_confirmed": {
        // Volume confirmed Donchian breakout
        const upper = indicatorValues.Donchian_Upper?.[i - 1];
        const lower = indicatorValues.Donchian_Lower?.[i - 1];
        const volSMA = indicatorValues.VolumeSMA?.[i];
        const atr = indicatorValues.ATR?.[i];
        const prevAtr = indicatorValues.ATR?.[i - 1];
        const volMult = config.params.volumeMultiplier || 1.5;

        if (upper && lower && volSMA && atr && prevAtr) {
          const volumeSpike = volume > volSMA * volMult;
          const atrRising = atr > prevAtr;

          // Breakout above with volume and volatility confirmation
          if (price > upper && prevPrice <= upper && volumeSpike && atrRising) {
            signals[i] = "buy";
          }
          // Breakdown below with volume and volatility confirmation
          else if (price < lower && prevPrice >= lower && volumeSpike && atrRising) {
            signals[i] = "sell";
          }
        }
        break;
      }

      case "simple_macd": {
        // Simple MACD signal crossover with trend filter
        const macd = indicatorValues.MACD?.[i];
        const macdSignal = indicatorValues.MACD_Signal?.[i];
        const prevMacd = indicatorValues.MACD?.[i - 1];
        const prevMacdSignal = indicatorValues.MACD_Signal?.[i - 1];
        const ema50 = indicatorValues.EMA_50?.[i];

        if (macd !== undefined && macdSignal !== undefined &&
            prevMacd !== undefined && prevMacdSignal !== undefined && ema50) {
          // MACD golden cross above EMA50
          if (macd > macdSignal && prevMacd <= prevMacdSignal && price > ema50) {
            signals[i] = "buy";
          }
          // MACD death cross below EMA50
          else if (macd < macdSignal && prevMacd >= prevMacdSignal && price < ema50) {
            signals[i] = "sell";
          }
        }
        break;
      }

      // ============ V8 STRATEGIES SIGNAL LOGIC ============

      case "vortex": {
        // Vortex Indicator crossover with ADX and EMA confirmation
        const viPlus = indicatorValues.VortexPlus?.[i];
        const viMinus = indicatorValues.VortexMinus?.[i];
        const prevViPlus = indicatorValues.VortexPlus?.[i - 1];
        const prevViMinus = indicatorValues.VortexMinus?.[i - 1];
        const adx = indicatorValues.ADX?.[i];
        const ema20 = indicatorValues.EMA_20?.[i];
        const adxThreshold = config.params.adxThreshold || 20;

        if (viPlus !== undefined && viMinus !== undefined &&
            prevViPlus !== undefined && prevViMinus !== undefined) {
          // VI+ crosses above VI- with ADX and EMA confirmation
          if (viPlus > viMinus && prevViPlus <= prevViMinus &&
              (adx === undefined || adx > adxThreshold) &&
              (ema20 === undefined || price > ema20)) {
            signals[i] = "buy";
          }
          // VI- crosses above VI+ with ADX and EMA confirmation
          else if (viMinus > viPlus && prevViMinus <= prevViPlus &&
                   (adx === undefined || adx > adxThreshold) &&
                   (ema20 === undefined || price < ema20)) {
            signals[i] = "sell";
          }
        }
        break;
      }

      case "ao": {
        // Awesome Oscillator zero cross or saucer pattern
        const ao = indicatorValues.AO?.[i];
        const prevAo = indicatorValues.AO?.[i - 1];
        const prevPrevAo = indicatorValues.AO?.[i - 2];
        const ema21 = indicatorValues.EMA_21?.[i];
        const rsi = indicatorValues.RSI?.[i];

        if (ao !== undefined && prevAo !== undefined) {
          // AO zero cross with trend confirmation
          if (ao > 0 && prevAo <= 0 && (ema21 === undefined || price > ema21)) {
            signals[i] = "buy";
          } else if (ao < 0 && prevAo >= 0 && (ema21 === undefined || price < ema21)) {
            signals[i] = "sell";
          }
          // Saucer pattern (bullish: AO > 0, dips then rises)
          else if (prevPrevAo !== undefined && ao > 0 && prevAo < ao && prevPrevAo > prevAo && (rsi === undefined || rsi > 45)) {
            signals[i] = "buy";
          }
          // Inverted saucer (bearish: AO < 0, rises then dips)
          else if (prevPrevAo !== undefined && ao < 0 && prevAo > ao && prevPrevAo < prevAo && (rsi === undefined || rsi < 55)) {
            signals[i] = "sell";
          }
        }
        break;
      }

      case "aroon": {
        // Aroon crossover and extreme levels
        const aroonUp = indicatorValues.AroonUp?.[i];
        const aroonDown = indicatorValues.AroonDown?.[i];
        const prevAroonUp = indicatorValues.AroonUp?.[i - 1];
        const prevAroonDown = indicatorValues.AroonDown?.[i - 1];
        const adx = indicatorValues.ADX?.[i];
        const ema20 = indicatorValues.EMA_20?.[i];
        const aroonThreshold = config.params.aroonThreshold || 70;
        const adxThreshold = config.params.adxThreshold || 25;

        if (aroonUp !== undefined && aroonDown !== undefined) {
          // Aroon Up crosses above Aroon Down
          if (prevAroonUp !== undefined && prevAroonDown !== undefined) {
            if (aroonUp > aroonDown && prevAroonUp <= prevAroonDown &&
                (ema20 === undefined || price > ema20)) {
              signals[i] = "buy";
            } else if (aroonDown > aroonUp && prevAroonDown <= prevAroonUp &&
                       (ema20 === undefined || price < ema20)) {
              signals[i] = "sell";
            }
          }
          // Extreme levels with ADX confirmation
          if (aroonUp >= 100 && aroonUp > aroonDown + 30 &&
              (adx === undefined || adx > adxThreshold)) {
            signals[i] = "buy";
          } else if (aroonDown >= 100 && aroonDown > aroonUp + 30 &&
                     (adx === undefined || adx > adxThreshold)) {
            signals[i] = "sell";
          }
        }
        break;
      }

      case "fisher": {
        // Fisher Transform crossover and extreme reversals
        const fisher = indicatorValues.Fisher?.[i];
        const trigger = indicatorValues.FisherTrigger?.[i];
        const prevFisher = indicatorValues.Fisher?.[i - 1];
        const prevTrigger = indicatorValues.FisherTrigger?.[i - 1];
        const ema21 = indicatorValues.EMA_21?.[i];
        const extremeLevel = config.params.extremeLevel || 1.5;

        if (fisher !== undefined && trigger !== undefined) {
          // Fisher crosses above trigger
          if (prevFisher !== undefined && prevTrigger !== undefined) {
            if (fisher > trigger && prevFisher <= prevTrigger &&
                (ema21 === undefined || price > ema21)) {
              signals[i] = "buy";
            } else if (fisher < trigger && prevFisher >= prevTrigger &&
                       (ema21 === undefined || price < ema21)) {
              signals[i] = "sell";
            }
          }
          // Extreme reversal signals
          if (fisher < -extremeLevel && fisher > trigger && prevFisher !== undefined && prevFisher <= trigger) {
            signals[i] = "buy";
          } else if (fisher > extremeLevel && fisher < trigger && prevFisher !== undefined && prevFisher >= trigger) {
            signals[i] = "sell";
          }
        }
        break;
      }

      case "ultimate": {
        // Ultimate Oscillator oversold/overbought with trend
        const uo = indicatorValues.UltimateOsc?.[i];
        const prevUo = indicatorValues.UltimateOsc?.[i - 1];
        const ema20 = indicatorValues.EMA_20?.[i];
        const aroonUp = indicatorValues.AroonUp?.[i];
        const aroonDown = indicatorValues.AroonDown?.[i];
        const oversold = config.params.oversold || 30;
        const overbought = config.params.overbought || 70;

        if (uo !== undefined && prevUo !== undefined) {
          // UO crosses above oversold with trend confirmation
          if (uo > oversold && prevUo <= oversold && (ema20 === undefined || price > ema20)) {
            signals[i] = "buy";
          } else if (uo < overbought && prevUo >= overbought && (ema20 === undefined || price < ema20)) {
            signals[i] = "sell";
          }
          // With Aroon confirmation
          if (aroonUp !== undefined && aroonDown !== undefined) {
            if (uo > 50 && prevUo <= 50 && aroonUp > aroonDown) {
              signals[i] = "buy";
            } else if (uo < 50 && prevUo >= 50 && aroonDown > aroonUp) {
              signals[i] = "sell";
            }
          }
        }
        break;
      }

      case "cmo": {
        // Chande Momentum Oscillator zero cross and extremes
        const cmo = indicatorValues.CMO?.[i];
        const prevCmo = indicatorValues.CMO?.[i - 1];
        const ema20 = indicatorValues.EMA_20?.[i];
        const adx = indicatorValues.ADX?.[i];
        const rsi = indicatorValues.RSI?.[i];
        const cmoThreshold = config.params.cmoThreshold || 20;
        const cmoExtreme = config.params.cmoExtreme || 50;
        const adxThreshold = config.params.adxThreshold || 25;

        if (cmo !== undefined && prevCmo !== undefined) {
          // CMO crosses above zero with trend confirmation
          if (cmo > 0 && prevCmo <= 0 && (ema20 === undefined || price > ema20)) {
            signals[i] = "buy";
          } else if (cmo < 0 && prevCmo >= 0 && (ema20 === undefined || price < ema20)) {
            signals[i] = "sell";
          }
          // CMO with ADX confirmation for stronger signals
          if (adx !== undefined && adx > adxThreshold) {
            if (cmo > cmoThreshold && price > (ema20 || price)) {
              signals[i] = "buy";
            } else if (cmo < -cmoThreshold && price < (ema20 || price)) {
              signals[i] = "sell";
            }
          }
          // Extreme levels with RSI and BB confirmation
          const bbUpper = indicatorValues.BB_Upper?.[i];
          const bbLower = indicatorValues.BB_Lower?.[i];
          if (rsi !== undefined && bbLower && cmo < -cmoExtreme && rsi < 30 && price <= bbLower) {
            signals[i] = "buy";
          } else if (rsi !== undefined && bbUpper && cmo > cmoExtreme && rsi > 70 && price >= bbUpper) {
            signals[i] = "sell";
          }
        }
        break;
      }

      case "vortex_macd": {
        // Vortex for trend, MACD for timing
        const viPlus = indicatorValues.VortexPlus?.[i];
        const viMinus = indicatorValues.VortexMinus?.[i];
        const macd = indicatorValues.MACD?.[i];
        const macdSignal = indicatorValues.MACD_Signal?.[i];
        const prevMacd = indicatorValues.MACD?.[i - 1];
        const prevMacdSignal = indicatorValues.MACD_Signal?.[i - 1];

        if (viPlus !== undefined && viMinus !== undefined &&
            macd !== undefined && macdSignal !== undefined &&
            prevMacd !== undefined && prevMacdSignal !== undefined) {
          // VI+ > VI- and MACD crosses above signal
          if (viPlus > viMinus && macd > macdSignal && prevMacd <= prevMacdSignal) {
            signals[i] = "buy";
          }
          // VI- > VI+ and MACD crosses below signal
          else if (viMinus > viPlus && macd < macdSignal && prevMacd >= prevMacdSignal) {
            signals[i] = "sell";
          }
        }
        break;
      }

      case "ao_macd": {
        // AO + MACD double momentum confirmation
        const ao = indicatorValues.AO?.[i];
        const macd = indicatorValues.MACD?.[i];
        const macdSignal = indicatorValues.MACD_Signal?.[i];
        const adx = indicatorValues.ADX?.[i];
        const adxThreshold = config.params.adxThreshold || 20;

        if (ao !== undefined && macd !== undefined && macdSignal !== undefined) {
          // Both momentum indicators aligned
          if (ao > 0 && macd > macdSignal && (adx === undefined || adx > adxThreshold)) {
            signals[i] = "buy";
          } else if (ao < 0 && macd < macdSignal && (adx === undefined || adx > adxThreshold)) {
            signals[i] = "sell";
          }
        }
        break;
      }

      case "triple_new": {
        // Vortex + Aroon + AO triple confirmation
        const viPlus = indicatorValues.VortexPlus?.[i];
        const viMinus = indicatorValues.VortexMinus?.[i];
        const aroonUp = indicatorValues.AroonUp?.[i];
        const aroonDown = indicatorValues.AroonDown?.[i];
        const ao = indicatorValues.AO?.[i];

        if (viPlus !== undefined && viMinus !== undefined &&
            aroonUp !== undefined && aroonDown !== undefined &&
            ao !== undefined) {
          // All three indicators bullish
          if (viPlus > viMinus && aroonUp > aroonDown && ao > 0) {
            signals[i] = "buy";
          }
          // All three indicators bearish
          else if (viMinus > viPlus && aroonDown > aroonUp && ao < 0) {
            signals[i] = "sell";
          }
        }
        break;
      }

      case "fisher_rsi": {
        // Fisher + RSI combo for reversal detection
        const fisher = indicatorValues.Fisher?.[i];
        const rsi = indicatorValues.RSI?.[i];
        const prevRsi = indicatorValues.RSI?.[i - 1];
        const ema20 = indicatorValues.EMA_20?.[i];

        if (fisher !== undefined && rsi !== undefined && prevRsi !== undefined) {
          // Fisher positive and RSI crosses above 50
          if (fisher > 0 && rsi > 50 && prevRsi <= 50 && (ema20 === undefined || price > ema20)) {
            signals[i] = "buy";
          } else if (fisher < 0 && rsi < 50 && prevRsi >= 50 && (ema20 === undefined || price < ema20)) {
            signals[i] = "sell";
          }
        }
        break;
      }

      case "ultimate_cmo": {
        // Ultimate Oscillator + CMO multi-timeframe momentum
        const uo = indicatorValues.UltimateOsc?.[i];
        const cmo = indicatorValues.CMO?.[i];
        const ema21 = indicatorValues.EMA_21?.[i];
        const uoMidline = config.params.uoMidline || 50;

        if (uo !== undefined && cmo !== undefined) {
          // Both oscillators aligned with trend
          if (uo > uoMidline && cmo > 0 && (ema21 === undefined || price > ema21)) {
            signals[i] = "buy";
          } else if (uo < uoMidline && cmo < 0 && (ema21 === undefined || price < ema21)) {
            signals[i] = "sell";
          }
        }
        break;
      }

      case "supertrend_vortex": {
        // Supertrend with Vortex confirmation
        const stDir = indicatorValues.Supertrend_Direction?.[i];
        const prevStDir = indicatorValues.Supertrend_Direction?.[i - 1];
        const viPlus = indicatorValues.VortexPlus?.[i];
        const viMinus = indicatorValues.VortexMinus?.[i];

        if (stDir !== undefined && viPlus !== undefined && viMinus !== undefined) {
          // Supertrend flips bullish with Vortex confirmation
          if (prevStDir !== undefined) {
            if (stDir === 1 && prevStDir === -1 && viPlus > viMinus) {
              signals[i] = "buy";
            } else if (stDir === -1 && prevStDir === 1 && viMinus > viPlus) {
              signals[i] = "sell";
            }
          }
          // Ongoing trend with strong Vortex
          if (stDir === 1 && viPlus > viMinus && viPlus > 1.1) {
            signals[i] = "buy";
          } else if (stDir === -1 && viMinus > viPlus && viMinus > 1.1) {
            signals[i] = "sell";
          }
        }
        break;
      }

      case "aroon_volume": {
        // Aroon with volume confirmation
        const aroonUp = indicatorValues.AroonUp?.[i];
        const aroonDown = indicatorValues.AroonDown?.[i];
        const volSMA = indicatorValues.VolumeSMA?.[i];
        const volMult = config.params.volumeMultiplier || 1.5;

        if (aroonUp !== undefined && aroonDown !== undefined && volSMA) {
          const volumeSpike = volume > volSMA * volMult;
          // Aroon Up reaches 100 with volume confirmation
          if (aroonUp >= 100 && volumeSpike) {
            signals[i] = "buy";
          } else if (aroonDown >= 100 && volumeSpike) {
            signals[i] = "sell";
          }
        }
        break;
      }

      case "ao_bb": {
        // Awesome Oscillator with Bollinger Bands
        const ao = indicatorValues.AO?.[i];
        const bbUpper = indicatorValues.BB_Upper?.[i];
        const bbMid = indicatorValues.BB_Mid?.[i];
        const bbLower = indicatorValues.BB_Lower?.[i];
        const rsi = indicatorValues.RSI?.[i];

        if (ao !== undefined && bbMid) {
          // AO positive and price crosses above middle BB
          if (ao > 0 && price > bbMid && prevPrice <= bbMid && (rsi === undefined || rsi > 50)) {
            signals[i] = "buy";
          } else if (ao < 0 && price < bbMid && prevPrice >= bbMid && (rsi === undefined || rsi < 50)) {
            signals[i] = "sell";
          }
        }
        break;
      }

      case "fisher_supertrend": {
        // Fisher for reversals, Supertrend for trend
        const fisher = indicatorValues.Fisher?.[i];
        const stDir = indicatorValues.Supertrend_Direction?.[i];
        const prevStDir = indicatorValues.Supertrend_Direction?.[i - 1];

        if (fisher !== undefined && stDir !== undefined && prevStDir !== undefined) {
          // Fisher positive and Supertrend flips bullish
          if (fisher > 0 && stDir === 1 && prevStDir === -1) {
            signals[i] = "buy";
          } else if (fisher < 0 && stDir === -1 && prevStDir === 1) {
            signals[i] = "sell";
          }
        }
        break;
      }

      case "cmo_adx": {
        // CMO momentum with ADX strength
        const cmo = indicatorValues.CMO?.[i];
        const adx = indicatorValues.ADX?.[i];
        const ema20 = indicatorValues.EMA_20?.[i];
        const cmoThreshold = config.params.cmoThreshold || 20;
        const adxThreshold = config.params.adxThreshold || 25;

        if (cmo !== undefined && adx !== undefined) {
          if (cmo > cmoThreshold && adx > adxThreshold && (ema20 === undefined || price > ema20)) {
            signals[i] = "buy";
          } else if (cmo < -cmoThreshold && adx > adxThreshold && (ema20 === undefined || price < ema20)) {
            signals[i] = "sell";
          }
        }
        break;
      }

      case "uo_aroon": {
        // Ultimate Oscillator with Aroon direction
        const uo = indicatorValues.UltimateOsc?.[i];
        const prevUo = indicatorValues.UltimateOsc?.[i - 1];
        const aroonUp = indicatorValues.AroonUp?.[i];
        const aroonDown = indicatorValues.AroonDown?.[i];
        const uoMidline = config.params.uoMidline || 50;

        if (uo !== undefined && prevUo !== undefined &&
            aroonUp !== undefined && aroonDown !== undefined) {
          // UO crosses above 50 with Aroon Up dominant
          if (uo > uoMidline && prevUo <= uoMidline && aroonUp > aroonDown) {
            signals[i] = "buy";
          } else if (uo < uoMidline && prevUo >= uoMidline && aroonDown > aroonUp) {
            signals[i] = "sell";
          }
        }
        break;
      }

      case "vortex_ema": {
        // Vortex with EMA ribbon confirmation
        const viPlus = indicatorValues.VortexPlus?.[i];
        const viMinus = indicatorValues.VortexMinus?.[i];
        const ema8 = indicatorValues.EMA_8?.[i];
        const ema13 = indicatorValues.EMA_13?.[i];
        const ema21 = indicatorValues.EMA_21?.[i];

        if (viPlus !== undefined && viMinus !== undefined &&
            ema8 && ema13 && ema21) {
          // VI+ > VI- with bullish EMA ribbon
          if (viPlus > viMinus && ema8 > ema13 && ema13 > ema21) {
            signals[i] = "buy";
          } else if (viMinus > viPlus && ema8 < ema13 && ema13 < ema21) {
            signals[i] = "sell";
          }
        }
        break;
      }

      case "ao_fisher": {
        // AO + Fisher reversal detection
        const ao = indicatorValues.AO?.[i];
        const prevAo = indicatorValues.AO?.[i - 1];
        const fisher = indicatorValues.Fisher?.[i];
        const rsi = indicatorValues.RSI?.[i];

        if (ao !== undefined && prevAo !== undefined && fisher !== undefined) {
          // AO crosses above 0 with Fisher positive and RSI confirmation
          if (ao > 0 && prevAo <= 0 && fisher > 0 && (rsi === undefined || rsi > 50)) {
            signals[i] = "buy";
          } else if (ao < 0 && prevAo >= 0 && fisher < 0 && (rsi === undefined || rsi < 50)) {
            signals[i] = "sell";
          }
        }
        break;
      }

      case "macd_rsi_opt": {
        // MACD RSI Optimized (73% WR) - 5/35/5 MACD with volume
        const macd = indicatorValues.MACD?.[i];
        const macdSignal = indicatorValues.MACD_Signal?.[i];
        const prevMacd = indicatorValues.MACD?.[i - 1];
        const prevMacdSignal = indicatorValues.MACD_Signal?.[i - 1];
        const rsi = indicatorValues.RSI?.[i];
        const volSMA = indicatorValues.VolumeSMA?.[i];
        const rsiLow = config.params.rsiLow || 40;
        const rsiHigh = config.params.rsiHigh || 60;

        if (macd !== undefined && macdSignal !== undefined &&
            prevMacd !== undefined && prevMacdSignal !== undefined &&
            rsi !== undefined) {
          const volumeConfirm = volSMA === undefined || volume > volSMA;
          // MACD golden cross with RSI not overbought and volume
          if (macd > macdSignal && prevMacd <= prevMacdSignal && rsi < rsiLow && volumeConfirm) {
            signals[i] = "buy";
          }
          // MACD death cross with RSI not oversold and volume
          else if (macd < macdSignal && prevMacd >= prevMacdSignal && rsi > rsiHigh && volumeConfirm) {
            signals[i] = "sell";
          }
        }
        break;
      }

      case "double_supertrend_opt": {
        // Double Supertrend Optimized - (7,2) + (25,5) research-proven
        const stDir1 = indicatorValues.Supertrend_Direction_1?.[i];
        const stDir2 = indicatorValues.Supertrend_Direction_2?.[i];
        const prevStDir1 = indicatorValues.Supertrend_Direction_1?.[i - 1];
        const prevStDir2 = indicatorValues.Supertrend_Direction_2?.[i - 1];
        const rsi = indicatorValues.RSI?.[i];

        if (stDir1 !== undefined && stDir2 !== undefined) {
          // Both Supertrends align bullish with RSI filter
          const bothBullish = stDir1 === 1 && stDir2 === 1;
          const bothBearish = stDir1 === -1 && stDir2 === -1;
          const wasNotBothBullish = prevStDir1 !== 1 || prevStDir2 !== 1;
          const wasNotBothBearish = prevStDir1 !== -1 || prevStDir2 !== -1;

          if (bothBullish && wasNotBothBullish && (rsi === undefined || rsi > 40)) {
            signals[i] = "buy";
          } else if (bothBearish && wasNotBothBearish && (rsi === undefined || rsi < 60)) {
            signals[i] = "sell";
          }
        }
        break;
      }

      // ============ V9 STRATEGIES - ITERATION 23 ============

      case "stc_crossover": {
        // Schaff Trend Cycle crossover at 25/75 levels
        const stc = indicatorValues.STC?.[i];
        const prevStc = indicatorValues.STC?.[i - 1];
        const ema = indicatorValues.EMA_20?.[i];
        const stcLow = config.params.stcLow || 25;
        const stcHigh = config.params.stcHigh || 75;

        if (stc !== undefined && prevStc !== undefined) {
          if (stc > stcLow && prevStc <= stcLow && (ema === undefined || price > ema)) {
            signals[i] = "buy";
          } else if (stc < stcHigh && prevStc >= stcHigh && (ema === undefined || price < ema)) {
            signals[i] = "sell";
          }
        }
        break;
      }

      case "stc_macd": {
        // STC with MACD confirmation
        const stc = indicatorValues.STC?.[i];
        const prevStc = indicatorValues.STC?.[i - 1];
        const macd = indicatorValues.MACD?.[i];
        const macdSignal = indicatorValues.MACD_Signal?.[i];
        const stcLow = config.params.stcLow || 25;
        const stcHigh = config.params.stcHigh || 75;

        if (stc !== undefined && prevStc !== undefined && macd !== undefined && macdSignal !== undefined) {
          // STC rising from oversold with MACD bullish
          if (stc > stcLow && stc > prevStc && macd > macdSignal) {
            signals[i] = "buy";
          } else if (stc < stcHigh && stc < prevStc && macd < macdSignal) {
            signals[i] = "sell";
          }
        }
        break;
      }

      case "stc_crypto": {
        // STC Crypto Fast - faster settings for crypto
        const stc = indicatorValues.STC?.[i];
        const prevStc = indicatorValues.STC?.[i - 1];
        const rsi = indicatorValues.RSI?.[i];
        const stcLow = config.params.stcLow || 20;
        const stcHigh = config.params.stcHigh || 80;

        if (stc !== undefined && prevStc !== undefined) {
          if (stc > stcLow && prevStc <= stcLow && (rsi === undefined || rsi > 45)) {
            signals[i] = "buy";
          } else if (stc < stcHigh && prevStc >= stcHigh && (rsi === undefined || rsi < 55)) {
            signals[i] = "sell";
          }
        }
        break;
      }

      case "efi_trend": {
        // Elder Force Index zero crossover
        const efi = indicatorValues.EFI?.[i];
        const prevEfi = indicatorValues.EFI?.[i - 1];
        const ema = indicatorValues.EMA_22?.[i];

        if (efi !== undefined && prevEfi !== undefined) {
          if (efi > 0 && prevEfi <= 0 && (ema === undefined || price > ema)) {
            signals[i] = "buy";
          } else if (efi < 0 && prevEfi >= 0 && (ema === undefined || price < ema)) {
            signals[i] = "sell";
          }
        }
        break;
      }

      case "efi_pullback": {
        // EFI 2-Day Pullback - buy when EFI dips negative in uptrend
        const efi = indicatorValues.EFI?.[i];
        const prevEfi = indicatorValues.EFI?.[i - 1];
        const ema = indicatorValues.EMA_22?.[i];
        const adx = indicatorValues.ADX?.[i];
        const adxThreshold = config.params.adxThreshold || 20;

        if (efi !== undefined && prevEfi !== undefined && ema !== undefined) {
          const isUptrend = price > ema;
          const isDowntrend = price < ema;
          const adxConfirm = adx === undefined || adx > adxThreshold;

          // Buy when EFI turns positive after dip in uptrend
          if (isUptrend && efi > 0 && prevEfi <= 0 && adxConfirm) {
            signals[i] = "buy";
          }
          // Sell when EFI turns negative after spike in downtrend
          else if (isDowntrend && efi < 0 && prevEfi >= 0 && adxConfirm) {
            signals[i] = "sell";
          }
        }
        break;
      }

      case "tsi_momentum": {
        // TSI signal line crossover
        const tsi = indicatorValues.TSI?.[i];
        const tsiSignal = indicatorValues.TSI_Signal?.[i];
        const prevTsi = indicatorValues.TSI?.[i - 1];
        const prevTsiSignal = indicatorValues.TSI_Signal?.[i - 1];
        const ema = indicatorValues.EMA_50?.[i];

        if (tsi !== undefined && tsiSignal !== undefined && prevTsi !== undefined && prevTsiSignal !== undefined) {
          if (tsi > tsiSignal && prevTsi <= prevTsiSignal && (ema === undefined || price > ema)) {
            signals[i] = "buy";
          } else if (tsi < tsiSignal && prevTsi >= prevTsiSignal && (ema === undefined || price < ema)) {
            signals[i] = "sell";
          }
        }
        break;
      }

      case "tsi_zero": {
        // TSI zero line crossover
        const tsi = indicatorValues.TSI?.[i];
        const prevTsi = indicatorValues.TSI?.[i - 1];
        const adx = indicatorValues.ADX?.[i];
        const adxThreshold = config.params.adxThreshold || 20;

        if (tsi !== undefined && prevTsi !== undefined) {
          const adxConfirm = adx === undefined || adx > adxThreshold;
          if (tsi > 0 && prevTsi <= 0 && adxConfirm) {
            signals[i] = "buy";
          } else if (tsi < 0 && prevTsi >= 0 && adxConfirm) {
            signals[i] = "sell";
          }
        }
        break;
      }

      case "kst_momentum": {
        // KST signal line crossover
        const kst = indicatorValues.KST?.[i];
        const kstSignal = indicatorValues.KST_Signal?.[i];
        const prevKst = indicatorValues.KST?.[i - 1];
        const prevKstSignal = indicatorValues.KST_Signal?.[i - 1];
        const ema = indicatorValues.EMA_20?.[i];

        if (kst !== undefined && kstSignal !== undefined && prevKst !== undefined && prevKstSignal !== undefined) {
          if (kst > kstSignal && prevKst <= prevKstSignal && (ema === undefined || price > ema)) {
            signals[i] = "buy";
          } else if (kst < kstSignal && prevKst >= prevKstSignal && (ema === undefined || price < ema)) {
            signals[i] = "sell";
          }
        }
        break;
      }

      case "crsi_extreme": {
        // Connors RSI extreme levels in ranging market
        const crsi = indicatorValues.CRSI?.[i];
        const adx = indicatorValues.ADX?.[i];
        const crsiLow = config.params.crsiLow || 10;
        const crsiHigh = config.params.crsiHigh || 90;
        const adxThreshold = config.params.adxThreshold || 25;

        if (crsi !== undefined) {
          const isRanging = adx === undefined || adx < adxThreshold;
          if (crsi < crsiLow && isRanging) {
            signals[i] = "buy";
          } else if (crsi > crsiHigh && isRanging) {
            signals[i] = "sell";
          }
        }
        break;
      }

      case "ppo_momentum": {
        // PPO signal line crossover with volume
        const ppo = indicatorValues.PPO?.[i];
        const ppoSignal = indicatorValues.PPO_Signal?.[i];
        const prevPpo = indicatorValues.PPO?.[i - 1];
        const prevPpoSignal = indicatorValues.PPO_Signal?.[i - 1];
        const volSMA = indicatorValues.VolumeSMA?.[i];
        const volumeMultiplier = config.params.volumeMultiplier || 1.2;

        if (ppo !== undefined && ppoSignal !== undefined && prevPpo !== undefined && prevPpoSignal !== undefined) {
          const volumeConfirm = volSMA === undefined || volume > volSMA * volumeMultiplier;
          if (ppo > ppoSignal && prevPpo <= prevPpoSignal && volumeConfirm) {
            signals[i] = "buy";
          } else if (ppo < ppoSignal && prevPpo >= prevPpoSignal && volumeConfirm) {
            signals[i] = "sell";
          }
        }
        break;
      }

      case "multi_factor": {
        // Multi-factor momentum V9 - full confluence
        const rsi = indicatorValues.RSI?.[i];
        const macd = indicatorValues.MACD?.[i];
        const macdSignal = indicatorValues.MACD_Signal?.[i];
        const ema50 = indicatorValues.EMA_50?.[i];
        const volSMA = indicatorValues.VolumeSMA?.[i];
        const volumeMultiplier = config.params.volumeMultiplier || 1.5;

        if (rsi !== undefined && macd !== undefined && macdSignal !== undefined) {
          const volumeSpike = volSMA === undefined || volume > volSMA * volumeMultiplier;
          const aboveEma = ema50 === undefined || price > ema50;
          const belowEma = ema50 === undefined || price < ema50;

          if (rsi > 50 && macd > macdSignal && aboveEma && volumeSpike) {
            signals[i] = "buy";
          } else if (rsi < 50 && macd < macdSignal && belowEma && volumeSpike) {
            signals[i] = "sell";
          }
        }
        break;
      }

      case "stc_tsi": {
        // STC + TSI combo
        const stc = indicatorValues.STC?.[i];
        const prevStc = indicatorValues.STC?.[i - 1];
        const tsi = indicatorValues.TSI?.[i];
        const tsiSignal = indicatorValues.TSI_Signal?.[i];

        if (stc !== undefined && prevStc !== undefined && tsi !== undefined && tsiSignal !== undefined) {
          // STC rising above 50 with TSI above signal
          if (stc > 50 && stc > prevStc && tsi > tsiSignal) {
            signals[i] = "buy";
          } else if (stc < 50 && stc < prevStc && tsi < tsiSignal) {
            signals[i] = "sell";
          }
        }
        break;
      }

      case "macd_rsi_73": {
        // MACD RSI 73% win rate + volume (5/35/5 MACD)
        const macd = indicatorValues.MACD?.[i];
        const macdSignal = indicatorValues.MACD_Signal?.[i];
        const prevMacd = indicatorValues.MACD?.[i - 1];
        const prevMacdSignal = indicatorValues.MACD_Signal?.[i - 1];
        const rsi = indicatorValues.RSI?.[i];
        const ema50 = indicatorValues.EMA_50?.[i];
        const volSMA = indicatorValues.VolumeSMA?.[i];
        const rsiOversold = config.params.rsiOversold || 40;
        const rsiOverbought = config.params.rsiOverbought || 60;

        if (macd !== undefined && macdSignal !== undefined && rsi !== undefined) {
          const volumeConfirm = volSMA === undefined || volume > volSMA;
          const aboveEma = ema50 === undefined || price > ema50;
          const belowEma = ema50 === undefined || price < ema50;

          if (macd > macdSignal && prevMacd !== undefined && prevMacdSignal !== undefined &&
              prevMacd <= prevMacdSignal && rsi < rsiOversold && volumeConfirm && aboveEma) {
            signals[i] = "buy";
          } else if (macd < macdSignal && prevMacd !== undefined && prevMacdSignal !== undefined &&
              prevMacd >= prevMacdSignal && rsi > rsiOverbought && volumeConfirm && belowEma) {
            signals[i] = "sell";
          }
        }
        break;
      }

      case "supertrend_stc": {
        // Supertrend + STC combo
        const stDir = indicatorValues.SupertrendDirection?.[i];
        const prevStDir = indicatorValues.SupertrendDirection?.[i - 1];
        const stc = indicatorValues.STC?.[i];
        const prevStc = indicatorValues.STC?.[i - 1];

        if (stDir !== undefined && stc !== undefined && prevStc !== undefined) {
          // Supertrend bullish and STC rising above 25
          if (stDir === 1 && stc > 25 && stc > prevStc) {
            signals[i] = "buy";
          } else if (stDir === -1 && stc < 75 && stc < prevStc) {
            signals[i] = "sell";
          }
        }
        break;
      }

      case "hull_efi": {
        // Hull MA + EFI combo
        const fastHMA = indicatorValues.HMA_9?.[i];
        const slowHMA = indicatorValues.HMA_21?.[i];
        const prevFastHMA = indicatorValues.HMA_9?.[i - 1];
        const prevSlowHMA = indicatorValues.HMA_21?.[i - 1];
        const efi = indicatorValues.EFI?.[i];

        if (fastHMA !== undefined && slowHMA !== undefined && efi !== undefined) {
          if (fastHMA > slowHMA && (prevFastHMA === undefined || prevFastHMA <= prevSlowHMA) && efi > 0) {
            signals[i] = "buy";
          } else if (fastHMA < slowHMA && (prevFastHMA === undefined || prevFastHMA >= prevSlowHMA) && efi < 0) {
            signals[i] = "sell";
          }
        }
        break;
      }

      case "keltner_tsi": {
        // Keltner + TSI breakout
        const upper = indicatorValues.Keltner_Upper?.[i];
        const lower = indicatorValues.Keltner_Lower?.[i];
        const tsi = indicatorValues.TSI?.[i];

        if (upper !== undefined && lower !== undefined && tsi !== undefined) {
          if (price > upper && tsi > 0) {
            signals[i] = "buy";
          } else if (price < lower && tsi < 0) {
            signals[i] = "sell";
          }
        }
        break;
      }

      case "adx_kst": {
        // ADX + KST trend
        const adx = indicatorValues.ADX?.[i];
        const plusDI = indicatorValues.PlusDI?.[i];
        const minusDI = indicatorValues.MinusDI?.[i];
        const kst = indicatorValues.KST?.[i];
        const kstSignal = indicatorValues.KST_Signal?.[i];
        const adxThreshold = config.params.adxThreshold || 25;

        if (adx !== undefined && plusDI !== undefined && minusDI !== undefined &&
            kst !== undefined && kstSignal !== undefined) {
          if (adx > adxThreshold && plusDI > minusDI && kst > kstSignal) {
            signals[i] = "buy";
          } else if (adx > adxThreshold && minusDI > plusDI && kst < kstSignal) {
            signals[i] = "sell";
          }
        }
        break;
      }

      case "donchian_efi": {
        // Donchian + EFI breakout
        const upper = indicatorValues.Donchian_Upper?.[i - 1];
        const lower = indicatorValues.Donchian_Lower?.[i - 1];
        const efi = indicatorValues.EFI?.[i];
        const adx = indicatorValues.ADX?.[i];
        const adxThreshold = config.params.adxThreshold || 20;

        if (upper !== undefined && lower !== undefined && efi !== undefined) {
          const adxConfirm = adx === undefined || adx > adxThreshold;
          if (price > upper && prevPrice <= upper && efi > 0 && adxConfirm) {
            signals[i] = "buy";
          } else if (price < lower && prevPrice >= lower && efi < 0 && adxConfirm) {
            signals[i] = "sell";
          }
        }
        break;
      }

      case "aroon_tsi": {
        // Aroon + TSI trend
        const aroonUp = indicatorValues.AroonUp?.[i];
        const aroonDown = indicatorValues.AroonDown?.[i];
        const aroonOsc = indicatorValues.AroonOsc?.[i];
        const tsi = indicatorValues.TSI?.[i];
        const aroonThreshold = config.params.aroonThreshold || 70;

        if (aroonUp !== undefined && aroonDown !== undefined && aroonOsc !== undefined && tsi !== undefined) {
          if (aroonUp > aroonThreshold && aroonOsc > 50 && tsi > 0) {
            signals[i] = "buy";
          } else if (aroonDown > aroonThreshold && aroonOsc < -50 && tsi < 0) {
            signals[i] = "sell";
          }
        }
        break;
      }

      case "triple_momentum_v9": {
        // Triple momentum V9 - RSI + TSI + STC alignment
        const rsi = indicatorValues.RSI?.[i];
        const tsi = indicatorValues.TSI?.[i];
        const stc = indicatorValues.STC?.[i];
        const rsiLong = config.params.rsiLong || 55;
        const rsiShort = config.params.rsiShort || 45;

        if (rsi !== undefined && tsi !== undefined && stc !== undefined) {
          if (rsi > rsiLong && tsi > 0 && stc > 60) {
            signals[i] = "buy";
          } else if (rsi < rsiShort && tsi < 0 && stc < 40) {
            signals[i] = "sell";
          }
        }
        break;
      }

      // ============ V10 STRATEGIES - ITERATION 51 ============

      case "adx_kst_pro": {
        // Enhanced ADX KST with EMA trend filter
        const adx = indicatorValues.ADX?.[i];
        const plusDI = indicatorValues.PlusDI?.[i];
        const minusDI = indicatorValues.MinusDI?.[i];
        const kst = indicatorValues.KST?.[i];
        const kstSignal = indicatorValues.KST_Signal?.[i];
        const prevKst = indicatorValues.KST?.[i - 1];
        const ema21 = indicatorValues.EMA_21?.[i];
        const adxThreshold = config.params.adxThreshold || 25;

        if (adx !== undefined && plusDI !== undefined && minusDI !== undefined &&
            kst !== undefined && kstSignal !== undefined && ema21 !== undefined) {
          const kstRising = prevKst !== undefined && kst > prevKst;
          const kstFalling = prevKst !== undefined && kst < prevKst;

          if (adx > adxThreshold && plusDI > minusDI && kst > kstSignal && kstRising && price > ema21) {
            signals[i] = "buy";
          } else if (adx > adxThreshold && minusDI > plusDI && kst < kstSignal && kstFalling && price < ema21) {
            signals[i] = "sell";
          }
        }
        break;
      }

      case "quad_momentum": {
        // Quad momentum confluence - RSI + MACD + ADX + KST
        const rsi = indicatorValues.RSI?.[i];
        const macdHist = indicatorValues.MACD_Histogram?.[i];
        const adx = indicatorValues.ADX?.[i];
        const kst = indicatorValues.KST?.[i];
        const kstSignal = indicatorValues.KST_Signal?.[i];
        const rsiLong = config.params.rsiLong || 55;
        const rsiShort = config.params.rsiShort || 45;
        const adxThreshold = config.params.adxThreshold || 25;

        if (rsi !== undefined && macdHist !== undefined && adx !== undefined &&
            kst !== undefined && kstSignal !== undefined) {
          if (rsi > rsiLong && macdHist > 0 && adx > adxThreshold && kst > kstSignal) {
            signals[i] = "buy";
          } else if (rsi < rsiShort && macdHist < 0 && adx > adxThreshold && kst < kstSignal) {
            signals[i] = "sell";
          }
        }
        break;
      }

      case "momentum_burst_vol": {
        // Momentum burst with volume confirmation
        const rsi = indicatorValues.RSI?.[i];
        const adx = indicatorValues.ADX?.[i];
        const ema10 = indicatorValues.EMA_10?.[i];
        const volume = candles[i].volume;
        const avgVolume = indicatorValues.VolumeSMA?.[i];
        const rsiLong = config.params.rsiLong || 60;
        const rsiShort = config.params.rsiShort || 40;
        const adxThreshold = config.params.adxThreshold || 30;
        const volumeMultiplier = config.params.volumeMultiplier || 1.2;

        if (rsi !== undefined && adx !== undefined && ema10 !== undefined && avgVolume !== undefined) {
          const volumeConfirm = volume > avgVolume * volumeMultiplier;
          if (rsi > rsiLong && adx > adxThreshold && price > ema10 && volumeConfirm) {
            signals[i] = "buy";
          } else if (rsi < rsiShort && adx > adxThreshold && price < ema10 && volumeConfirm) {
            signals[i] = "sell";
          }
        }
        break;
      }

      case "rsi_adx_surge_pro": {
        // RSI ADX surge with dual EMA filter
        const rsi = indicatorValues.RSI?.[i];
        const adx = indicatorValues.ADX?.[i];
        const ema13 = indicatorValues.EMA_13?.[i];
        const ema34 = indicatorValues.EMA_34?.[i];
        const rsiLong = config.params.rsiLong || 55;
        const rsiShort = config.params.rsiShort || 45;
        const adxThreshold = config.params.adxThreshold || 25;

        if (rsi !== undefined && adx !== undefined && ema13 !== undefined && ema34 !== undefined) {
          if (rsi > rsiLong && adx > adxThreshold && ema13 > ema34 && price > ema13) {
            signals[i] = "buy";
          } else if (rsi < rsiShort && adx > adxThreshold && ema13 < ema34 && price < ema13) {
            signals[i] = "sell";
          }
        }
        break;
      }

      case "tsi_kst_confluence": {
        // TSI + KST double multi-timeframe momentum
        const tsi = indicatorValues.TSI?.[i];
        const tsiSignal = indicatorValues.TSI_Signal?.[i];
        const kst = indicatorValues.KST?.[i];
        const kstSignal = indicatorValues.KST_Signal?.[i];
        const adx = indicatorValues.ADX?.[i];
        const adxThreshold = config.params.adxThreshold || 20;

        if (tsi !== undefined && tsiSignal !== undefined && kst !== undefined &&
            kstSignal !== undefined && adx !== undefined) {
          if (tsi > 0 && tsi > tsiSignal && kst > kstSignal && adx > adxThreshold) {
            signals[i] = "buy";
          } else if (tsi < 0 && tsi < tsiSignal && kst < kstSignal && adx > adxThreshold) {
            signals[i] = "sell";
          }
        }
        break;
      }

      case "efi_rsi_momentum": {
        // EFI + RSI momentum with trend filter
        const efi = indicatorValues.EFI?.[i];
        const prevEfi = indicatorValues.EFI?.[i - 1];
        const rsi = indicatorValues.RSI?.[i];
        const ema21 = indicatorValues.EMA_21?.[i];
        const rsiLong = config.params.rsiLong || 55;
        const rsiShort = config.params.rsiShort || 45;

        if (efi !== undefined && rsi !== undefined && ema21 !== undefined && prevEfi !== undefined) {
          const efiRising = efi > prevEfi;
          const efiFalling = efi < prevEfi;

          if (efi > 0 && efiRising && rsi > rsiLong && price > ema21) {
            signals[i] = "buy";
          } else if (efi < 0 && efiFalling && rsi < rsiShort && price < ema21) {
            signals[i] = "sell";
          }
        }
        break;
      }

      case "supertrend_adx_vol": {
        // Supertrend + ADX + volume confirmation
        const stDir = indicatorValues.Supertrend_Direction?.[i];
        const prevStDir = indicatorValues.Supertrend_Direction?.[i - 1];
        const adx = indicatorValues.ADX?.[i];
        const volume = candles[i].volume;
        const avgVolume = indicatorValues.VolumeSMA?.[i];
        const adxThreshold = config.params.adxThreshold || 25;
        const volumeMultiplier = config.params.volumeMultiplier || 1.3;

        if (stDir !== undefined && adx !== undefined && avgVolume !== undefined) {
          const volumeConfirm = volume > avgVolume * volumeMultiplier;
          // Signal on Supertrend flip with ADX and volume confirmation
          if (stDir === 1 && prevStDir === -1 && adx > adxThreshold && volumeConfirm) {
            signals[i] = "buy";
          } else if (stDir === -1 && prevStDir === 1 && adx > adxThreshold && volumeConfirm) {
            signals[i] = "sell";
          }
        }
        break;
      }

      case "fast_momentum_scalp": {
        // Fast momentum scalp with ADX filter
        const rsi = indicatorValues.RSI?.[i];
        const ema5 = indicatorValues.EMA_5?.[i];
        const ema13 = indicatorValues.EMA_13?.[i];
        const adx = indicatorValues.ADX?.[i];
        const rsiLong = config.params.rsiLong || 55;
        const rsiShort = config.params.rsiShort || 45;
        const adxThreshold = config.params.adxThreshold || 20;

        if (rsi !== undefined && ema5 !== undefined && ema13 !== undefined && adx !== undefined) {
          if (rsi > rsiLong && ema5 > ema13 && adx > adxThreshold) {
            signals[i] = "buy";
          } else if (rsi < rsiShort && ema5 < ema13 && adx > adxThreshold) {
            signals[i] = "sell";
          }
        }
        break;
      }

      case "breakout_momentum_pro": {
        // Donchian breakout with RSI + ADX momentum
        const upper = indicatorValues.Donchian_Upper?.[i - 1];
        const lower = indicatorValues.Donchian_Lower?.[i - 1];
        const rsi = indicatorValues.RSI?.[i];
        const adx = indicatorValues.ADX?.[i];
        const adxThreshold = config.params.adxThreshold || 25;

        if (upper !== undefined && lower !== undefined && rsi !== undefined && adx !== undefined) {
          if (price > upper && prevPrice <= upper && rsi > 50 && adx > adxThreshold) {
            signals[i] = "buy";
          } else if (price < lower && prevPrice >= lower && rsi < 50 && adx > adxThreshold) {
            signals[i] = "sell";
          }
        }
        break;
      }

      case "stc_adx_trend": {
        // STC + ADX trend detection
        const stc = indicatorValues.STC?.[i];
        const prevStc = indicatorValues.STC?.[i - 1];
        const adx = indicatorValues.ADX?.[i];
        const ema21 = indicatorValues.EMA_21?.[i];
        const stcLow = config.params.stcLow || 25;
        const stcHigh = config.params.stcHigh || 75;
        const adxThreshold = config.params.adxThreshold || 20;

        if (stc !== undefined && prevStc !== undefined && adx !== undefined && ema21 !== undefined) {
          const stcRising = stc > prevStc;
          const stcFalling = stc < prevStc;

          // Buy when STC crosses above low threshold and rising
          if (stc > stcLow && prevStc <= stcLow && stcRising && adx > adxThreshold && price > ema21) {
            signals[i] = "buy";
          }
          // Sell when STC crosses below high threshold and falling
          else if (stc < stcHigh && prevStc >= stcHigh && stcFalling && adx > adxThreshold && price < ema21) {
            signals[i] = "sell";
          }
        }
        break;
      }

      // ============ V11 STRATEGIES - ITERATION 67 ============

      case "ichimoku_cloud": {
        // Ichimoku Cloud Breakout
        const cloudTop = indicatorValues.Ichimoku_CloudTop?.[i];
        const cloudBottom = indicatorValues.Ichimoku_CloudBottom?.[i];
        const prevCloudTop = indicatorValues.Ichimoku_CloudTop?.[i - 1];
        const prevCloudBottom = indicatorValues.Ichimoku_CloudBottom?.[i - 1];
        const adx = indicatorValues.ADX?.[i];
        const adxThreshold = config.params.adxThreshold || 20;

        if (cloudTop !== undefined && cloudBottom !== undefined) {
          const adxConfirm = adx === undefined || adx > adxThreshold;
          // Price breaks above cloud
          if (price > cloudTop && prevPrice <= prevCloudTop && adxConfirm) {
            signals[i] = "buy";
          }
          // Price breaks below cloud
          else if (price < cloudBottom && prevPrice >= prevCloudBottom && adxConfirm) {
            signals[i] = "sell";
          }
        }
        break;
      }

      case "ichimoku_tk": {
        // Ichimoku TK Cross
        const tenkan = indicatorValues.Ichimoku_Tenkan?.[i];
        const kijun = indicatorValues.Ichimoku_Kijun?.[i];
        const prevTenkan = indicatorValues.Ichimoku_Tenkan?.[i - 1];
        const prevKijun = indicatorValues.Ichimoku_Kijun?.[i - 1];
        const cloudTop = indicatorValues.Ichimoku_CloudTop?.[i];
        const cloudBottom = indicatorValues.Ichimoku_CloudBottom?.[i];
        const cloudBullish = indicatorValues.Ichimoku_CloudBullish?.[i];

        if (tenkan !== undefined && kijun !== undefined && cloudTop !== undefined && cloudBottom !== undefined) {
          // Bullish TK cross above cloud
          if (tenkan > kijun && prevTenkan <= prevKijun && price > cloudTop && cloudBullish === 1) {
            signals[i] = "buy";
          }
          // Bearish TK cross below cloud
          else if (tenkan < kijun && prevTenkan >= prevKijun && price < cloudBottom && cloudBullish === 0) {
            signals[i] = "sell";
          }
        }
        break;
      }

      case "ichimoku_crypto": {
        // Ichimoku Crypto Optimized settings
        const tenkan = indicatorValues.Ichimoku_Tenkan?.[i];
        const kijun = indicatorValues.Ichimoku_Kijun?.[i];
        const cloudTop = indicatorValues.Ichimoku_CloudTop?.[i];
        const cloudBottom = indicatorValues.Ichimoku_CloudBottom?.[i];
        const rsi = indicatorValues.RSI?.[i];

        if (tenkan !== undefined && kijun !== undefined && cloudTop !== undefined && cloudBottom !== undefined && rsi !== undefined) {
          if (price > cloudTop && tenkan > kijun && rsi > 50) {
            signals[i] = "buy";
          } else if (price < cloudBottom && tenkan < kijun && rsi < 50) {
            signals[i] = "sell";
          }
        }
        break;
      }

      case "vwap_bands": {
        // VWAP Bands strategies
        const vwap = indicatorValues.VWAPBands_VWAP?.[i];
        const upper2 = indicatorValues.VWAPBands_Upper2?.[i];
        const lower2 = indicatorValues.VWAPBands_Lower2?.[i];
        const rsi = indicatorValues.RSI?.[i];
        const adx = indicatorValues.ADX?.[i];
        const avgVolume = indicatorValues.VolumeSMA?.[i];
        const adxThreshold = config.params.adxThreshold || 25;
        const volumeMultiplier = config.params.volumeMultiplier || 1.5;

        if (vwap !== undefined && upper2 !== undefined && lower2 !== undefined) {
          // Mean reversion version
          if (config.id.includes("reversion") && rsi !== undefined) {
            if (price <= lower2 && rsi < 30) {
              signals[i] = "buy";
            } else if (price >= upper2 && rsi > 70) {
              signals[i] = "sell";
            }
          }
          // Momentum breakout version
          else if (config.id.includes("momentum") && adx !== undefined && avgVolume !== undefined) {
            const volumeConfirm = volume > avgVolume * volumeMultiplier;
            if (price > upper2 && adx > adxThreshold && volumeConfirm) {
              signals[i] = "buy";
            } else if (price < lower2 && adx > adxThreshold && volumeConfirm) {
              signals[i] = "sell";
            }
          }
        }
        break;
      }

      case "rolling_vwap": {
        // Rolling VWAP Trend
        const rvwap = indicatorValues.RollingVWAP?.[i];
        const ema9 = indicatorValues.EMA_9?.[i];
        const prevEma9 = indicatorValues.EMA_9?.[i - 1];
        const prevRvwap = indicatorValues.RollingVWAP?.[i - 1];
        const adx = indicatorValues.ADX?.[i];
        const adxThreshold = config.params.adxThreshold || 20;

        if (rvwap !== undefined && ema9 !== undefined && adx !== undefined) {
          // EMA9 crosses above RVWAP
          if (ema9 > rvwap && prevEma9 <= prevRvwap && price > rvwap && adx > adxThreshold) {
            signals[i] = "buy";
          }
          // EMA9 crosses below RVWAP
          else if (ema9 < rvwap && prevEma9 >= prevRvwap && price < rvwap && adx > adxThreshold) {
            signals[i] = "sell";
          }
        }
        break;
      }

      case "market_structure": {
        // Market Structure BOS and CHoCH
        const trend = indicatorValues.MS_Trend?.[i];
        const bos = indicatorValues.MS_BOS?.[i];
        const choch = indicatorValues.MS_CHoCH?.[i];
        const rsi = indicatorValues.RSI?.[i];
        const avgVolume = indicatorValues.VolumeSMA?.[i];
        const volumeMultiplier = config.params.volumeMultiplier || 1.5;

        // BOS version - trend continuation
        if (config.id.includes("bos") && bos !== undefined && trend !== undefined && rsi !== undefined) {
          if (bos === 1 && trend === 1 && rsi > 50) {
            signals[i] = "buy";
          } else if (bos === -1 && trend === -1 && rsi < 50) {
            signals[i] = "sell";
          }
        }
        // CHoCH version - trend reversal
        else if (config.id.includes("choch") && choch !== undefined && rsi !== undefined && avgVolume !== undefined) {
          const volumeSpike = volume > avgVolume * volumeMultiplier;
          const prevRsi = indicatorValues.RSI?.[i - 1];
          if (choch === 1 && rsi > 50 && prevRsi <= 50 && volumeSpike) {
            signals[i] = "buy";
          } else if (choch === -1 && rsi < 50 && prevRsi >= 50 && volumeSpike) {
            signals[i] = "sell";
          }
        }
        break;
      }

      case "squeeze_momentum": {
        // Squeeze Momentum Breakout
        const inSqueeze = indicatorValues.Squeeze_InSqueeze?.[i];
        const prevInSqueeze = indicatorValues.Squeeze_InSqueeze?.[i - 1];
        const momentum = indicatorValues.Squeeze_Momentum?.[i];
        const prevMomentum = indicatorValues.Squeeze_Momentum?.[i - 1];
        const ema21 = indicatorValues.EMA_21?.[i];

        if (inSqueeze !== undefined && momentum !== undefined && ema21 !== undefined) {
          // Exit squeeze (was in squeeze, now out)
          const exitSqueeze = prevInSqueeze === 1 && inSqueeze === 0;
          const momentumRising = momentum > prevMomentum;
          const momentumFalling = momentum < prevMomentum;

          if (exitSqueeze && momentum > 0 && momentumRising && price > ema21) {
            signals[i] = "buy";
          } else if (exitSqueeze && momentum < 0 && momentumFalling && price < ema21) {
            signals[i] = "sell";
          }
        }
        break;
      }

      case "multi_factor": {
        // Multi-Factor Confluence V11
        const rsi = indicatorValues.RSI?.[i];
        const macd = indicatorValues.MACD?.[i];
        const macdSignal = indicatorValues.MACD_Signal?.[i];
        const adx = indicatorValues.ADX?.[i];
        const stc = indicatorValues.STC?.[i];
        const rsiLong = config.params.rsiLong || 55;
        const rsiShort = config.params.rsiShort || 45;
        const adxThreshold = config.params.adxThreshold || 25;

        if (rsi !== undefined && macd !== undefined && macdSignal !== undefined && adx !== undefined && stc !== undefined) {
          if (rsi > rsiLong && macd > macdSignal && adx > adxThreshold && stc > 60) {
            signals[i] = "buy";
          } else if (rsi < rsiShort && macd < macdSignal && adx > adxThreshold && stc < 40) {
            signals[i] = "sell";
          }
        }
        break;
      }

      case "ichimoku_vwap": {
        // Ichimoku + VWAP Combo
        const cloudTop = indicatorValues.Ichimoku_CloudTop?.[i];
        const cloudBottom = indicatorValues.Ichimoku_CloudBottom?.[i];
        const vwap = indicatorValues.VWAP?.[i];
        const rsi = indicatorValues.RSI?.[i];

        if (cloudTop !== undefined && cloudBottom !== undefined && vwap !== undefined && rsi !== undefined) {
          if (price > cloudTop && price > vwap && rsi > 50) {
            signals[i] = "buy";
          } else if (price < cloudBottom && price < vwap && rsi < 50) {
            signals[i] = "sell";
          }
        }
        break;
      }

      case "trend_intensity": {
        // Trend Intensity Momentum
        const tii = indicatorValues.TII?.[i];
        const rsi = indicatorValues.RSI?.[i];
        const ema21 = indicatorValues.EMA_21?.[i];

        if (tii !== undefined && rsi !== undefined && ema21 !== undefined) {
          if (tii > 60 && rsi > 55 && price > ema21) {
            signals[i] = "buy";
          } else if (tii < 40 && rsi < 45 && price < ema21) {
            signals[i] = "sell";
          }
        }
        break;
      }

      case "price_momentum": {
        // Price Momentum Score
        const pms = indicatorValues.PMS?.[i];
        const adx = indicatorValues.ADX?.[i];
        const avgVolume = indicatorValues.VolumeSMA?.[i];
        const adxThreshold = config.params.adxThreshold || 25;

        if (pms !== undefined && adx !== undefined && avgVolume !== undefined) {
          if (pms > 65 && adx > adxThreshold && volume > avgVolume) {
            signals[i] = "buy";
          } else if (pms < 35 && adx > adxThreshold && volume > avgVolume) {
            signals[i] = "sell";
          }
        }
        break;
      }

      case "smart_money": {
        // Smart Money Structure
        const bos = indicatorValues.MS_BOS?.[i];
        const efi = indicatorValues.EFI?.[i];
        const adx = indicatorValues.ADX?.[i];
        const adxThreshold = config.params.adxThreshold || 20;

        if (bos !== undefined && efi !== undefined && adx !== undefined) {
          if (bos === 1 && efi > 0 && adx > adxThreshold) {
            signals[i] = "buy";
          } else if (bos === -1 && efi < 0 && adx > adxThreshold) {
            signals[i] = "sell";
          }
        }
        break;
      }

      case "ad_trend": {
        // Accumulation Distribution Trend
        const ad = indicatorValues.AD?.[i];
        const prevAd = indicatorValues.AD?.[i - 1];
        const ema21 = indicatorValues.EMA_21?.[i];
        const rsi = indicatorValues.RSI?.[i];

        if (ad !== undefined && prevAd !== undefined && ema21 !== undefined && rsi !== undefined) {
          const adRising = ad > prevAd;
          const adFalling = ad < prevAd;

          if (adRising && price > ema21 && rsi > 50) {
            signals[i] = "buy";
          } else if (adFalling && price < ema21 && rsi < 50) {
            signals[i] = "sell";
          }
        }
        break;
      }

      case "ichimoku_rsi": {
        // Ichimoku RSI BB Confluence
        const cloudTop = indicatorValues.Ichimoku_CloudTop?.[i];
        const cloudBottom = indicatorValues.Ichimoku_CloudBottom?.[i];
        const rsi = indicatorValues.RSI?.[i];
        const bbLower = indicatorValues.Bollinger_Lower?.[i];
        const bbUpper = indicatorValues.Bollinger_Upper?.[i];
        const bbMiddle = indicatorValues.Bollinger_Middle?.[i];

        if (cloudTop !== undefined && cloudBottom !== undefined && rsi !== undefined && bbLower !== undefined && bbUpper !== undefined && bbMiddle !== undefined) {
          const nearLowerBB = (price - bbLower) / (bbMiddle - bbLower) < 0.3;
          const nearUpperBB = (bbUpper - price) / (bbUpper - bbMiddle) < 0.3;

          if (price > cloudTop && rsi > 50 && nearLowerBB) {
            signals[i] = "buy";
          } else if (price < cloudBottom && rsi < 50 && nearUpperBB) {
            signals[i] = "sell";
          }
        }
        break;
      }

      case "vwap_adx": {
        // VWAP ADX Momentum
        const vwap = indicatorValues.VWAP?.[i];
        const prevVwap = indicatorValues.VWAP?.[i - 1];
        const adx = indicatorValues.ADX?.[i];
        const rsi = indicatorValues.RSI?.[i];
        const adxThreshold = config.params.adxThreshold || 25;
        const rsiLong = config.params.rsiLong || 55;
        const rsiShort = config.params.rsiShort || 45;

        if (vwap !== undefined && adx !== undefined && rsi !== undefined) {
          // Price crosses above VWAP
          if (price > vwap && prevPrice <= prevVwap && adx > adxThreshold && rsi > rsiLong) {
            signals[i] = "buy";
          }
          // Price crosses below VWAP
          else if (price < vwap && prevPrice >= prevVwap && adx > adxThreshold && rsi < rsiShort) {
            signals[i] = "sell";
          }
        }
        break;
      }

      case "squeeze_tsi": {
        // Squeeze + TSI Combo
        const inSqueeze = indicatorValues.Squeeze_InSqueeze?.[i];
        const tsi = indicatorValues.TSI?.[i];
        const tsiSignal = indicatorValues.TSI_Signal?.[i];
        const prevTsi = indicatorValues.TSI?.[i - 1];

        if (inSqueeze !== undefined && tsi !== undefined && tsiSignal !== undefined) {
          const tsiRising = prevTsi !== undefined && tsi > prevTsi;
          const tsiFalling = prevTsi !== undefined && tsi < prevTsi;

          if (inSqueeze === 1 && tsi > tsiSignal && tsiRising) {
            signals[i] = "buy";
          } else if (inSqueeze === 1 && tsi < tsiSignal && tsiFalling) {
            signals[i] = "sell";
          }
        }
        break;
      }

      case "structure_ema": {
        // Structure + EMA Cloud
        const trend = indicatorValues.MS_Trend?.[i];
        const ema9 = indicatorValues.EMA_9?.[i];
        const ema21 = indicatorValues.EMA_21?.[i];
        const ema55 = indicatorValues.EMA_55?.[i];

        if (trend !== undefined && ema9 !== undefined && ema21 !== undefined && ema55 !== undefined) {
          // Bull trend with EMA alignment
          if (trend === 1 && ema9 > ema21 && ema21 > ema55 && price > ema9) {
            signals[i] = "buy";
          }
          // Bear trend with EMA alignment
          else if (trend === -1 && ema9 < ema21 && ema21 < ema55 && price < ema9) {
            signals[i] = "sell";
          }
        }
        break;
      }

      case "ultimate_confluence": {
        // Ultimate Confluence V11 - 5-factor alignment
        const cloudTop = indicatorValues.Ichimoku_CloudTop?.[i];
        const cloudBottom = indicatorValues.Ichimoku_CloudBottom?.[i];
        const rsi = indicatorValues.RSI?.[i];
        const macd = indicatorValues.MACD?.[i];
        const macdSignal = indicatorValues.MACD_Signal?.[i];
        const adx = indicatorValues.ADX?.[i];
        const avgVolume = indicatorValues.VolumeSMA?.[i];
        const rsiLong = config.params.rsiLong || 55;
        const rsiShort = config.params.rsiShort || 45;
        const adxThreshold = config.params.adxThreshold || 25;

        if (cloudTop !== undefined && cloudBottom !== undefined && rsi !== undefined &&
            macd !== undefined && macdSignal !== undefined && adx !== undefined && avgVolume !== undefined) {
          const volumeConfirm = volume > avgVolume;

          if (price > cloudTop && rsi > rsiLong && macd > macdSignal && adx > adxThreshold && volumeConfirm) {
            signals[i] = "buy";
          } else if (price < cloudBottom && rsi < rsiShort && macd < macdSignal && adx > adxThreshold && volumeConfirm) {
            signals[i] = "sell";
          }
        }
        break;
      }
    }
  }

  return { config, signals, indicatorValues };
}

// Main function to test
export async function runStrategyLab() {
  console.log("=== Strategy Lab V2 ===\n");

  const allStrategies = generateAllStrategies();
  console.log(`Generated ${allStrategies.length} strategy variations\n`);

  // Group by template
  const byTemplate: Record<string, number> = {};
  for (const s of allStrategies) {
    const parts = s.id.split("_");
    const template = parts.slice(0, 2).join("_");
    byTemplate[template] = (byTemplate[template] || 0) + 1;
  }

  console.log("Strategy variations by template:");
  for (const [template, count] of Object.entries(byTemplate)) {
    console.log(`  ${template}: ${count} variations`);
  }

  return allStrategies;
}

// CLI entry
const isMain = process.argv[1]?.includes("strategy-lab");
if (isMain) {
  runStrategyLab();
}
