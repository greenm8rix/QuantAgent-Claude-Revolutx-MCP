// Technical Indicators for Quant Trading

export interface Candle {
  start: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

// Simple Moving Average
export function SMA(data: number[], period: number): number[] {
  const result: number[] = [];
  for (let i = 0; i < data.length; i++) {
    if (i < period - 1) {
      result.push(NaN);
    } else {
      const sum = data.slice(i - period + 1, i + 1).reduce((a, b) => a + b, 0);
      result.push(sum / period);
    }
  }
  return result;
}

// Exponential Moving Average
export function EMA(data: number[], period: number): number[] {
  const result: number[] = [];
  const multiplier = 2 / (period + 1);

  for (let i = 0; i < data.length; i++) {
    if (i === 0) {
      result.push(data[0]);
    } else if (i < period - 1) {
      // Use SMA for initial values
      const sum = data.slice(0, i + 1).reduce((a, b) => a + b, 0);
      result.push(sum / (i + 1));
    } else if (i === period - 1) {
      const sum = data.slice(0, period).reduce((a, b) => a + b, 0);
      result.push(sum / period);
    } else {
      result.push((data[i] - result[i - 1]) * multiplier + result[i - 1]);
    }
  }
  return result;
}

// Relative Strength Index
export function RSI(closes: number[], period = 14): number[] {
  const result: number[] = [];
  const gains: number[] = [];
  const losses: number[] = [];

  for (let i = 0; i < closes.length; i++) {
    if (i === 0) {
      result.push(NaN);
      gains.push(0);
      losses.push(0);
      continue;
    }

    const change = closes[i] - closes[i - 1];
    gains.push(change > 0 ? change : 0);
    losses.push(change < 0 ? Math.abs(change) : 0);

    if (i < period) {
      result.push(NaN);
    } else if (i === period) {
      const avgGain = gains.slice(1, period + 1).reduce((a, b) => a + b, 0) / period;
      const avgLoss = losses.slice(1, period + 1).reduce((a, b) => a + b, 0) / period;
      const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
      result.push(100 - 100 / (1 + rs));
    } else {
      const prevRSI = result[i - 1];
      const prevAvgGain = (100 - prevRSI) === 0 ? 0 : (prevRSI / (100 - prevRSI));
      const avgGain = (prevAvgGain * (period - 1) + gains[i]) / period;
      const avgLoss = ((1 / (prevAvgGain || 0.001)) * (period - 1) + losses[i]) / period;
      const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
      result.push(100 - 100 / (1 + rs));
    }
  }

  // Recalculate properly
  const properResult: number[] = [];
  for (let i = 0; i < closes.length; i++) {
    if (i < period) {
      properResult.push(NaN);
    } else {
      let avgGain = 0;
      let avgLoss = 0;

      if (i === period) {
        for (let j = 1; j <= period; j++) {
          const change = closes[j] - closes[j - 1];
          if (change > 0) avgGain += change;
          else avgLoss += Math.abs(change);
        }
        avgGain /= period;
        avgLoss /= period;
      } else {
        const prevIdx = i - 1;
        const change = closes[i] - closes[i - 1];
        const gain = change > 0 ? change : 0;
        const loss = change < 0 ? Math.abs(change) : 0;

        // Approximate previous averages
        const prevRS = properResult[prevIdx] === 100 ? 999 : properResult[prevIdx] / (100 - properResult[prevIdx]);
        const prevAvgLoss = 1;
        const prevAvgGain = prevRS * prevAvgLoss;

        avgGain = (prevAvgGain * (period - 1) + gain) / period;
        avgLoss = (prevAvgLoss * (period - 1) + loss) / period;
      }

      const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
      properResult.push(100 - 100 / (1 + rs));
    }
  }

  return properResult;
}

// Simpler RSI calculation
export function RSI_Simple(closes: number[], period = 14): number[] {
  const result: number[] = new Array(closes.length).fill(NaN);

  for (let i = period; i < closes.length; i++) {
    let gains = 0;
    let losses = 0;

    for (let j = i - period + 1; j <= i; j++) {
      const change = closes[j] - closes[j - 1];
      if (change > 0) gains += change;
      else losses += Math.abs(change);
    }

    const avgGain = gains / period;
    const avgLoss = losses / period;
    const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
    result[i] = 100 - 100 / (1 + rs);
  }

  return result;
}

// MACD
export interface MACDResult {
  macd: number[];
  signal: number[];
  histogram: number[];
}

export function MACD(closes: number[], fastPeriod = 12, slowPeriod = 26, signalPeriod = 9): MACDResult {
  const fastEMA = EMA(closes, fastPeriod);
  const slowEMA = EMA(closes, slowPeriod);

  const macdLine = fastEMA.map((fast, i) => fast - slowEMA[i]);
  const signalLine = EMA(macdLine.filter(v => !isNaN(v)), signalPeriod);

  // Pad signal line to match length
  const paddedSignal: number[] = new Array(slowPeriod - 1 + signalPeriod - 1).fill(NaN);
  paddedSignal.push(...signalLine);

  const histogram = macdLine.map((m, i) => m - (paddedSignal[i] || 0));

  return {
    macd: macdLine,
    signal: paddedSignal,
    histogram,
  };
}

// Bollinger Bands
export interface BollingerResult {
  upper: number[];
  middle: number[];
  lower: number[];
  bandwidth: number[];
}

export function BollingerBands(closes: number[], period = 20, stdDev = 2): BollingerResult {
  const middle = SMA(closes, period);
  const upper: number[] = [];
  const lower: number[] = [];
  const bandwidth: number[] = [];

  for (let i = 0; i < closes.length; i++) {
    if (i < period - 1) {
      upper.push(NaN);
      lower.push(NaN);
      bandwidth.push(NaN);
    } else {
      const slice = closes.slice(i - period + 1, i + 1);
      const mean = middle[i];
      const variance = slice.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / period;
      const std = Math.sqrt(variance);

      upper.push(mean + stdDev * std);
      lower.push(mean - stdDev * std);
      bandwidth.push((upper[i] - lower[i]) / middle[i] * 100);
    }
  }

  return { upper, middle, lower, bandwidth };
}

// Average True Range (ATR)
export function ATR(candles: Candle[], period = 14): number[] {
  const trueRanges: number[] = [];

  for (let i = 0; i < candles.length; i++) {
    if (i === 0) {
      trueRanges.push(candles[i].high - candles[i].low);
    } else {
      const tr = Math.max(
        candles[i].high - candles[i].low,
        Math.abs(candles[i].high - candles[i - 1].close),
        Math.abs(candles[i].low - candles[i - 1].close)
      );
      trueRanges.push(tr);
    }
  }

  return EMA(trueRanges, period);
}

// Stochastic RSI
export function StochRSI(closes: number[], rsiPeriod = 14, stochPeriod = 14): number[] {
  const rsi = RSI_Simple(closes, rsiPeriod);
  const result: number[] = new Array(closes.length).fill(NaN);

  for (let i = rsiPeriod + stochPeriod - 1; i < closes.length; i++) {
    const rsiSlice = rsi.slice(i - stochPeriod + 1, i + 1).filter(v => !isNaN(v));
    if (rsiSlice.length < stochPeriod) continue;

    const minRSI = Math.min(...rsiSlice);
    const maxRSI = Math.max(...rsiSlice);
    const range = maxRSI - minRSI;

    result[i] = range === 0 ? 50 : ((rsi[i] - minRSI) / range) * 100;
  }

  return result;
}

// Volume Weighted Average Price (VWAP) - intraday
export function VWAP(candles: Candle[]): number[] {
  const result: number[] = [];
  let cumulativeTPV = 0;
  let cumulativeVolume = 0;

  for (const candle of candles) {
    const typicalPrice = (candle.high + candle.low + candle.close) / 3;
    cumulativeTPV += typicalPrice * candle.volume;
    cumulativeVolume += candle.volume;
    result.push(cumulativeVolume === 0 ? typicalPrice : cumulativeTPV / cumulativeVolume);
  }

  return result;
}

// Rate of Change (ROC)
export function ROC(closes: number[], period = 10): number[] {
  const result: number[] = new Array(period).fill(NaN);

  for (let i = period; i < closes.length; i++) {
    result.push(((closes[i] - closes[i - period]) / closes[i - period]) * 100);
  }

  return result;
}

// On-Balance Volume (OBV)
export function OBV(candles: Candle[]): number[] {
  const result: number[] = [0];

  for (let i = 1; i < candles.length; i++) {
    if (candles[i].close > candles[i - 1].close) {
      result.push(result[i - 1] + candles[i].volume);
    } else if (candles[i].close < candles[i - 1].close) {
      result.push(result[i - 1] - candles[i].volume);
    } else {
      result.push(result[i - 1]);
    }
  }

  return result;
}

// Money Flow Index (MFI)
export function MFI(candles: Candle[], period = 14): number[] {
  const result: number[] = new Array(period).fill(NaN);
  const typicalPrices = candles.map(c => (c.high + c.low + c.close) / 3);
  const moneyFlows = candles.map((c, i) => typicalPrices[i] * c.volume);

  for (let i = period; i < candles.length; i++) {
    let positiveFlow = 0;
    let negativeFlow = 0;

    for (let j = i - period + 1; j <= i; j++) {
      if (typicalPrices[j] > typicalPrices[j - 1]) {
        positiveFlow += moneyFlows[j];
      } else {
        negativeFlow += moneyFlows[j];
      }
    }

    const mfr = negativeFlow === 0 ? 100 : positiveFlow / negativeFlow;
    result.push(100 - 100 / (1 + mfr));
  }

  return result;
}

// Commodity Channel Index (CCI)
export function CCI(candles: Candle[], period = 20): number[] {
  const typicalPrices = candles.map(c => (c.high + c.low + c.close) / 3);
  const smaTP = SMA(typicalPrices, period);
  const result: number[] = new Array(period - 1).fill(NaN);

  for (let i = period - 1; i < candles.length; i++) {
    const slice = typicalPrices.slice(i - period + 1, i + 1);
    const meanDev = slice.reduce((sum, tp) => sum + Math.abs(tp - smaTP[i]), 0) / period;
    result.push((typicalPrices[i] - smaTP[i]) / (0.015 * meanDev));
  }

  return result;
}

// ADX - Average Directional Index (trend strength)
export function ADX(candles: Candle[], period = 14): { adx: number[], plusDI: number[], minusDI: number[] } {
  const plusDM: number[] = [];
  const minusDM: number[] = [];
  const tr: number[] = [];

  for (let i = 0; i < candles.length; i++) {
    if (i === 0) {
      plusDM.push(0);
      minusDM.push(0);
      tr.push(candles[i].high - candles[i].low);
    } else {
      const highDiff = candles[i].high - candles[i - 1].high;
      const lowDiff = candles[i - 1].low - candles[i].low;

      plusDM.push(highDiff > lowDiff && highDiff > 0 ? highDiff : 0);
      minusDM.push(lowDiff > highDiff && lowDiff > 0 ? lowDiff : 0);

      tr.push(Math.max(
        candles[i].high - candles[i].low,
        Math.abs(candles[i].high - candles[i - 1].close),
        Math.abs(candles[i].low - candles[i - 1].close)
      ));
    }
  }

  const smoothedTR = EMA(tr, period);
  const smoothedPlusDM = EMA(plusDM, period);
  const smoothedMinusDM = EMA(minusDM, period);

  const plusDI: number[] = [];
  const minusDI: number[] = [];
  const dx: number[] = [];

  for (let i = 0; i < candles.length; i++) {
    const pdi = smoothedTR[i] !== 0 ? (smoothedPlusDM[i] / smoothedTR[i]) * 100 : 0;
    const mdi = smoothedTR[i] !== 0 ? (smoothedMinusDM[i] / smoothedTR[i]) * 100 : 0;
    plusDI.push(pdi);
    minusDI.push(mdi);

    const sum = pdi + mdi;
    dx.push(sum !== 0 ? (Math.abs(pdi - mdi) / sum) * 100 : 0);
  }

  const adx = EMA(dx, period);

  return { adx, plusDI, minusDI };
}

// Volume SMA - for volume confirmation
export function VolumeSMA(candles: Candle[], period = 20): number[] {
  const volumes = candles.map(c => c.volume);
  return SMA(volumes, period);
}

// Supertrend indicator
export function Supertrend(candles: Candle[], period = 10, multiplier = 3): { trend: number[], direction: number[] } {
  const atr = ATR(candles, period);
  const trend: number[] = [];
  const direction: number[] = []; // 1 = bullish, -1 = bearish

  for (let i = 0; i < candles.length; i++) {
    if (i < period || isNaN(atr[i])) {
      trend.push(NaN);
      direction.push(0);
      continue;
    }

    const hl2 = (candles[i].high + candles[i].low) / 2;
    const upperBand = hl2 + multiplier * atr[i];
    const lowerBand = hl2 - multiplier * atr[i];

    if (i === period) {
      if (candles[i].close > hl2) {
        trend.push(lowerBand);
        direction.push(1);
      } else {
        trend.push(upperBand);
        direction.push(-1);
      }
    } else {
      const prevTrend = trend[i - 1];
      const prevDir = direction[i - 1];

      if (prevDir === 1) {
        // Was bullish
        if (candles[i].close < prevTrend) {
          // Switch to bearish
          trend.push(upperBand);
          direction.push(-1);
        } else {
          // Stay bullish, trail up
          trend.push(Math.max(prevTrend, lowerBand));
          direction.push(1);
        }
      } else {
        // Was bearish
        if (candles[i].close > prevTrend) {
          // Switch to bullish
          trend.push(lowerBand);
          direction.push(1);
        } else {
          // Stay bearish, trail down
          trend.push(Math.min(prevTrend, upperBand));
          direction.push(-1);
        }
      }
    }
  }

  return { trend, direction };
}

// Donchian Channel (for breakout strategies)
export function DonchianChannel(candles: Candle[], period = 20): { upper: number[], lower: number[], middle: number[] } {
  const upper: number[] = [];
  const lower: number[] = [];
  const middle: number[] = [];

  for (let i = 0; i < candles.length; i++) {
    if (i < period - 1) {
      upper.push(NaN);
      lower.push(NaN);
      middle.push(NaN);
    } else {
      const slice = candles.slice(i - period + 1, i + 1);
      const highestHigh = Math.max(...slice.map(c => c.high));
      const lowestLow = Math.min(...slice.map(c => c.low));
      upper.push(highestHigh);
      lower.push(lowestLow);
      middle.push((highestHigh + lowestLow) / 2);
    }
  }

  return { upper, lower, middle };
}

// Keltner Channel
export function KeltnerChannel(candles: Candle[], emaPeriod = 20, atrPeriod = 10, multiplier = 2): { upper: number[], middle: number[], lower: number[] } {
  const closes = candles.map(c => c.close);
  const middle = EMA(closes, emaPeriod);
  const atr = ATR(candles, atrPeriod);

  const upper: number[] = [];
  const lower: number[] = [];

  for (let i = 0; i < candles.length; i++) {
    if (isNaN(middle[i]) || isNaN(atr[i])) {
      upper.push(NaN);
      lower.push(NaN);
    } else {
      upper.push(middle[i] + multiplier * atr[i]);
      lower.push(middle[i] - multiplier * atr[i]);
    }
  }

  return { upper, middle, lower };
}

// Williams %R
export function WilliamsR(candles: Candle[], period = 14): number[] {
  const result: number[] = [];

  for (let i = 0; i < candles.length; i++) {
    if (i < period - 1) {
      result.push(NaN);
    } else {
      const slice = candles.slice(i - period + 1, i + 1);
      const highestHigh = Math.max(...slice.map(c => c.high));
      const lowestLow = Math.min(...slice.map(c => c.low));
      const range = highestHigh - lowestLow;
      result.push(range === 0 ? -50 : ((highestHigh - candles[i].close) / range) * -100);
    }
  }

  return result;
}

// Parabolic SAR
export function ParabolicSAR(candles: Candle[], afStart = 0.02, afStep = 0.02, afMax = 0.2): { sar: number[], trend: number[] } {
  const sar: number[] = [];
  const trend: number[] = []; // 1 = bullish, -1 = bearish

  if (candles.length < 2) {
    return { sar: [], trend: [] };
  }

  // Initialize
  let isUptrend = candles[1].close > candles[0].close;
  let ep = isUptrend ? candles[0].high : candles[0].low; // Extreme point
  let af = afStart;
  let currentSAR = isUptrend ? candles[0].low : candles[0].high;

  sar.push(currentSAR);
  trend.push(isUptrend ? 1 : -1);

  for (let i = 1; i < candles.length; i++) {
    const prevSAR = currentSAR;

    // Calculate new SAR
    currentSAR = prevSAR + af * (ep - prevSAR);

    if (isUptrend) {
      // In uptrend, SAR cannot be above prior two lows
      currentSAR = Math.min(currentSAR, candles[i - 1].low);
      if (i > 1) currentSAR = Math.min(currentSAR, candles[i - 2].low);

      // Check for reversal
      if (candles[i].low < currentSAR) {
        // Switch to downtrend
        isUptrend = false;
        currentSAR = ep;
        ep = candles[i].low;
        af = afStart;
      } else {
        // Update EP and AF
        if (candles[i].high > ep) {
          ep = candles[i].high;
          af = Math.min(af + afStep, afMax);
        }
      }
    } else {
      // In downtrend, SAR cannot be below prior two highs
      currentSAR = Math.max(currentSAR, candles[i - 1].high);
      if (i > 1) currentSAR = Math.max(currentSAR, candles[i - 2].high);

      // Check for reversal
      if (candles[i].high > currentSAR) {
        // Switch to uptrend
        isUptrend = true;
        currentSAR = ep;
        ep = candles[i].high;
        af = afStart;
      } else {
        // Update EP and AF
        if (candles[i].low < ep) {
          ep = candles[i].low;
          af = Math.min(af + afStep, afMax);
        }
      }
    }

    sar.push(currentSAR);
    trend.push(isUptrend ? 1 : -1);
  }

  return { sar, trend };
}

// Hull Moving Average (faster, less lag)
export function HMA(data: number[], period = 9): number[] {
  const halfPeriod = Math.floor(period / 2);
  const sqrtPeriod = Math.floor(Math.sqrt(period));

  const wma1 = WMA(data, halfPeriod);
  const wma2 = WMA(data, period);

  const diff: number[] = [];
  for (let i = 0; i < data.length; i++) {
    diff.push(2 * wma1[i] - wma2[i]);
  }

  return WMA(diff, sqrtPeriod);
}

// Weighted Moving Average
export function WMA(data: number[], period: number): number[] {
  const result: number[] = [];
  const divisor = (period * (period + 1)) / 2;

  for (let i = 0; i < data.length; i++) {
    if (i < period - 1) {
      result.push(NaN);
    } else {
      let sum = 0;
      for (let j = 0; j < period; j++) {
        sum += data[i - period + 1 + j] * (j + 1);
      }
      result.push(sum / divisor);
    }
  }

  return result;
}

// Chaikin Money Flow (volume-weighted momentum)
export function CMF(candles: Candle[], period = 20): number[] {
  const result: number[] = [];

  for (let i = 0; i < candles.length; i++) {
    if (i < period - 1) {
      result.push(NaN);
    } else {
      let mfVolume = 0;
      let totalVolume = 0;

      for (let j = i - period + 1; j <= i; j++) {
        const c = candles[j];
        const range = c.high - c.low;
        const mfm = range === 0 ? 0 : ((c.close - c.low) - (c.high - c.close)) / range;
        mfVolume += mfm * c.volume;
        totalVolume += c.volume;
      }

      result.push(totalVolume === 0 ? 0 : mfVolume / totalVolume);
    }
  }

  return result;
}

// Momentum indicator
export function Momentum(closes: number[], period = 10): number[] {
  const result: number[] = new Array(period).fill(NaN);

  for (let i = period; i < closes.length; i++) {
    result.push(closes[i] - closes[i - period]);
  }

  return result;
}

// Average Directional Movement Rating
export function ADXR(candles: Candle[], period = 14): number[] {
  const { adx } = ADX(candles, period);
  const result: number[] = [];

  for (let i = 0; i < candles.length; i++) {
    if (i < period * 2) {
      result.push(NaN);
    } else {
      result.push((adx[i] + adx[i - period]) / 2);
    }
  }

  return result;
}

// Price Rate of Change normalized
export function PriceChannelPosition(candles: Candle[], period = 20): number[] {
  const result: number[] = [];

  for (let i = 0; i < candles.length; i++) {
    if (i < period - 1) {
      result.push(NaN);
    } else {
      const slice = candles.slice(i - period + 1, i + 1);
      const highest = Math.max(...slice.map(c => c.high));
      const lowest = Math.min(...slice.map(c => c.low));
      const range = highest - lowest;
      result.push(range === 0 ? 50 : ((candles[i].close - lowest) / range) * 100);
    }
  }

  return result;
}

// ============ V8 NEW INDICATORS - ITERATION 12 ============

// Vortex Indicator - measures upward and downward trend movement
export function VortexIndicator(candles: Candle[], period = 14): { viPlus: number[], viMinus: number[] } {
  const viPlus: number[] = [];
  const viMinus: number[] = [];
  
  const vmPlus: number[] = [];
  const vmMinus: number[] = [];
  const tr: number[] = [];
  
  for (let i = 0; i < candles.length; i++) {
    if (i === 0) {
      vmPlus.push(0);
      vmMinus.push(0);
      tr.push(candles[i].high - candles[i].low);
    } else {
      // VM+ = |High - Prior Low|
      vmPlus.push(Math.abs(candles[i].high - candles[i - 1].low));
      // VM- = |Low - Prior High|
      vmMinus.push(Math.abs(candles[i].low - candles[i - 1].high));
      // True Range
      tr.push(Math.max(
        candles[i].high - candles[i].low,
        Math.abs(candles[i].high - candles[i - 1].close),
        Math.abs(candles[i].low - candles[i - 1].close)
      ));
    }
  }
  
  for (let i = 0; i < candles.length; i++) {
    if (i < period) {
      viPlus.push(NaN);
      viMinus.push(NaN);
    } else {
      const sumVMPlus = vmPlus.slice(i - period + 1, i + 1).reduce((a, b) => a + b, 0);
      const sumVMMinus = vmMinus.slice(i - period + 1, i + 1).reduce((a, b) => a + b, 0);
      const sumTR = tr.slice(i - period + 1, i + 1).reduce((a, b) => a + b, 0);
      
      viPlus.push(sumTR === 0 ? 1 : sumVMPlus / sumTR);
      viMinus.push(sumTR === 0 ? 1 : sumVMMinus / sumTR);
    }
  }
  
  return { viPlus, viMinus };
}

// Awesome Oscillator (AO) - Bill Williams indicator
// Measures market momentum using the difference between 5 and 34 period SMAs of median price
export function AwesomeOscillator(candles: Candle[], fastPeriod = 5, slowPeriod = 34): number[] {
  const medianPrices = candles.map(c => (c.high + c.low) / 2);
  const fastSMA = SMA(medianPrices, fastPeriod);
  const slowSMA = SMA(medianPrices, slowPeriod);
  
  const result: number[] = [];
  for (let i = 0; i < candles.length; i++) {
    if (isNaN(fastSMA[i]) || isNaN(slowSMA[i])) {
      result.push(NaN);
    } else {
      result.push(fastSMA[i] - slowSMA[i]);
    }
  }
  
  return result;
}

// Aroon Indicator - measures trend strength and identifies new trends
export function AroonIndicator(candles: Candle[], period = 14): { aroonUp: number[], aroonDown: number[], oscillator: number[] } {
  const aroonUp: number[] = [];
  const aroonDown: number[] = [];
  const oscillator: number[] = [];
  
  for (let i = 0; i < candles.length; i++) {
    if (i < period) {
      aroonUp.push(NaN);
      aroonDown.push(NaN);
      oscillator.push(NaN);
    } else {
      const slice = candles.slice(i - period, i + 1);
      
      // Find periods since highest high and lowest low
      let highestIdx = 0;
      let lowestIdx = 0;
      let highestHigh = slice[0].high;
      let lowestLow = slice[0].low;
      
      for (let j = 1; j < slice.length; j++) {
        if (slice[j].high >= highestHigh) {
          highestHigh = slice[j].high;
          highestIdx = j;
        }
        if (slice[j].low <= lowestLow) {
          lowestLow = slice[j].low;
          lowestIdx = j;
        }
      }
      
      const periodsSinceHigh = period - highestIdx;
      const periodsSinceLow = period - lowestIdx;
      
      const up = ((period - periodsSinceHigh) / period) * 100;
      const down = ((period - periodsSinceLow) / period) * 100;
      
      aroonUp.push(up);
      aroonDown.push(down);
      oscillator.push(up - down);
    }
  }
  
  return { aroonUp, aroonDown, oscillator };
}

// Klinger Oscillator - volume-based momentum indicator
export function KlingerOscillator(candles: Candle[], fastPeriod = 34, slowPeriod = 55, signalPeriod = 13): { klinger: number[], signal: number[] } {
  const hlc3 = candles.map(c => (c.high + c.low + c.close) / 3);
  const volumeForce: number[] = [];
  
  for (let i = 0; i < candles.length; i++) {
    if (i === 0) {
      volumeForce.push(0);
    } else {
      const trend = hlc3[i] > hlc3[i - 1] ? 1 : -1;
      const dm = candles[i].high - candles[i].low;
      const cm = dm === 0 ? 0 : Math.abs(2 * (candles[i].close - candles[i].low) / dm - 1);
      volumeForce.push(trend * candles[i].volume * (2 * cm - 1));
    }
  }
  
  const fastEMA = EMA(volumeForce, fastPeriod);
  const slowEMA = EMA(volumeForce, slowPeriod);
  
  const klinger: number[] = [];
  for (let i = 0; i < candles.length; i++) {
    klinger.push(fastEMA[i] - slowEMA[i]);
  }
  
  const signal = EMA(klinger, signalPeriod);
  
  return { klinger, signal };
}

// Chande Momentum Oscillator (CMO) - measures pure momentum without smoothing
export function CMO(closes: number[], period = 14): number[] {
  const result: number[] = new Array(period).fill(NaN);
  
  for (let i = period; i < closes.length; i++) {
    let upSum = 0;
    let downSum = 0;
    
    for (let j = i - period + 1; j <= i; j++) {
      const change = closes[j] - closes[j - 1];
      if (change > 0) upSum += change;
      else downSum += Math.abs(change);
    }
    
    const sum = upSum + downSum;
    result.push(sum === 0 ? 0 : ((upSum - downSum) / sum) * 100);
  }
  
  return result;
}

// Ultimate Oscillator - combines short, medium, and long-term momentum
export function UltimateOscillator(candles: Candle[], period1 = 7, period2 = 14, period3 = 28): number[] {
  const result: number[] = [];
  const bp: number[] = []; // Buying Pressure
  const tr: number[] = []; // True Range
  
  for (let i = 0; i < candles.length; i++) {
    if (i === 0) {
      bp.push(candles[i].close - candles[i].low);
      tr.push(candles[i].high - candles[i].low);
    } else {
      const prevClose = candles[i - 1].close;
      bp.push(candles[i].close - Math.min(candles[i].low, prevClose));
      tr.push(Math.max(candles[i].high, prevClose) - Math.min(candles[i].low, prevClose));
    }
  }
  
  for (let i = 0; i < candles.length; i++) {
    if (i < period3 - 1) {
      result.push(NaN);
    } else {
      const bp1 = bp.slice(i - period1 + 1, i + 1).reduce((a, b) => a + b, 0);
      const tr1 = tr.slice(i - period1 + 1, i + 1).reduce((a, b) => a + b, 0);
      const bp2 = bp.slice(i - period2 + 1, i + 1).reduce((a, b) => a + b, 0);
      const tr2 = tr.slice(i - period2 + 1, i + 1).reduce((a, b) => a + b, 0);
      const bp3 = bp.slice(i - period3 + 1, i + 1).reduce((a, b) => a + b, 0);
      const tr3 = tr.slice(i - period3 + 1, i + 1).reduce((a, b) => a + b, 0);
      
      const avg1 = tr1 === 0 ? 0 : bp1 / tr1;
      const avg2 = tr2 === 0 ? 0 : bp2 / tr2;
      const avg3 = tr3 === 0 ? 0 : bp3 / tr3;
      
      result.push(((4 * avg1) + (2 * avg2) + avg3) / 7 * 100);
    }
  }
  
  return result;
}

// Fisher Transform - converts prices to Gaussian normal distribution for clearer signals
export function FisherTransform(candles: Candle[], period = 10): { fisher: number[], trigger: number[] } {
  const fisher: number[] = [];
  const trigger: number[] = [];
  
  for (let i = 0; i < candles.length; i++) {
    if (i < period - 1) {
      fisher.push(NaN);
      trigger.push(NaN);
    } else {
      const slice = candles.slice(i - period + 1, i + 1);
      const highestHigh = Math.max(...slice.map(c => c.high));
      const lowestLow = Math.min(...slice.map(c => c.low));
      const range = highestHigh - lowestLow;
      
      // Normalized value between -1 and 1
      let value = range === 0 ? 0 : 2 * ((candles[i].close - lowestLow) / range - 0.5);
      value = Math.max(-0.999, Math.min(0.999, value)); // Clamp to prevent infinity
      
      // Fisher Transform
      const fisherValue = 0.5 * Math.log((1 + value) / (1 - value));
      fisher.push(fisherValue);
      
      // Trigger is the previous Fisher value
      trigger.push(i > 0 && !isNaN(fisher[i - 1]) ? fisher[i - 1] : fisherValue);
    }
  }
  
  return { fisher, trigger };
}

// Ehlers Fisher Transform - smoother version with EMA
export function EhlersFisher(candles: Candle[], period = 10): number[] {
  const { fisher } = FisherTransform(candles, period);
  return EMA(fisher.map(v => isNaN(v) ? 0 : v), 3);
}

// Mass Index - detects trend reversals based on range expansions/contractions
export function MassIndex(candles: Candle[], period = 25, emaPeriod = 9): number[] {
  const ranges = candles.map(c => c.high - c.low);
  const emaRanges = EMA(ranges, emaPeriod);
  const doubleEMA = EMA(emaRanges, emaPeriod);

  const result: number[] = [];

  for (let i = 0; i < candles.length; i++) {
    if (i < period + emaPeriod * 2 - 2) {
      result.push(NaN);
    } else {
      let sum = 0;
      for (let j = i - period + 1; j <= i; j++) {
        if (doubleEMA[j] !== 0 && !isNaN(emaRanges[j]) && !isNaN(doubleEMA[j])) {
          sum += emaRanges[j] / doubleEMA[j];
        }
      }
      result.push(sum);
    }
  }

  return result;
}

// ============ V9 NEW INDICATORS - ITERATION 23 ============

// Schaff Trend Cycle (STC) - Combines MACD with Stochastic for faster signals
// STC oscillates between 0-100, with 25/75 as key signal levels
export function SchaffTrendCycle(closes: number[], fastPeriod = 23, slowPeriod = 50, cyclePeriod = 10): number[] {
  // Calculate MACD line (fast EMA - slow EMA)
  const fastEMA = EMA(closes, fastPeriod);
  const slowEMA = EMA(closes, slowPeriod);
  const macdLine: number[] = [];

  for (let i = 0; i < closes.length; i++) {
    macdLine.push(fastEMA[i] - slowEMA[i]);
  }

  // First Stochastic of MACD
  const stoch1: number[] = [];
  for (let i = 0; i < closes.length; i++) {
    if (i < cyclePeriod - 1) {
      stoch1.push(NaN);
    } else {
      const slice = macdLine.slice(i - cyclePeriod + 1, i + 1).filter(v => !isNaN(v));
      if (slice.length < cyclePeriod) {
        stoch1.push(NaN);
        continue;
      }
      const low = Math.min(...slice);
      const high = Math.max(...slice);
      const range = high - low;
      stoch1.push(range === 0 ? 50 : ((macdLine[i] - low) / range) * 100);
    }
  }

  // EMA of first stochastic
  const pf = EMA(stoch1.map(v => isNaN(v) ? 50 : v), cyclePeriod);

  // Second Stochastic of PF
  const stoch2: number[] = [];
  for (let i = 0; i < closes.length; i++) {
    if (i < cyclePeriod * 2 - 2) {
      stoch2.push(NaN);
    } else {
      const slice = pf.slice(i - cyclePeriod + 1, i + 1).filter(v => !isNaN(v));
      if (slice.length < cyclePeriod) {
        stoch2.push(NaN);
        continue;
      }
      const low = Math.min(...slice);
      const high = Math.max(...slice);
      const range = high - low;
      stoch2.push(range === 0 ? 50 : ((pf[i] - low) / range) * 100);
    }
  }

  // Final STC = EMA of second stochastic
  const stc = EMA(stoch2.map(v => isNaN(v) ? 50 : v), cyclePeriod);

  return stc;
}

// Elder Force Index (EFI) - Measures force behind price movements
// Formula: EFI = (Current Close - Previous Close) * Volume, then smoothed with EMA
export function ElderForceIndex(candles: Candle[], period = 13): number[] {
  const rawForce: number[] = [0]; // First value is 0

  for (let i = 1; i < candles.length; i++) {
    const priceChange = candles[i].close - candles[i - 1].close;
    rawForce.push(priceChange * candles[i].volume);
  }

  // Smooth with EMA
  return EMA(rawForce, period);
}

// Coppock Curve - Long-term momentum indicator for bottom detection
// Formula: 10-period WMA of (14-period ROC + 11-period ROC)
export function CoppockCurve(closes: number[], shortROC = 11, longROC = 14, wmaPeriod = 10): number[] {
  const roc11 = ROC(closes, shortROC);
  const roc14 = ROC(closes, longROC);

  // Sum of ROCs
  const rocSum: number[] = [];
  for (let i = 0; i < closes.length; i++) {
    if (isNaN(roc11[i]) || isNaN(roc14[i])) {
      rocSum.push(NaN);
    } else {
      rocSum.push(roc11[i] + roc14[i]);
    }
  }

  // WMA of the sum
  return WMA(rocSum.map(v => isNaN(v) ? 0 : v), wmaPeriod);
}

// Detrended Price Oscillator (DPO) - Removes trend to identify cycles
// Formula: Close - SMA(period/2 + 1 periods ago)
export function DetrendedPriceOscillator(closes: number[], period = 20): number[] {
  const result: number[] = [];
  const shift = Math.floor(period / 2) + 1;
  const sma = SMA(closes, period);

  for (let i = 0; i < closes.length; i++) {
    if (i < period + shift - 1) {
      result.push(NaN);
    } else {
      // DPO = Close - SMA(shifted back)
      result.push(closes[i - shift] - sma[i - shift]);
    }
  }

  return result;
}

// Percentage Price Oscillator (PPO) - Like MACD but normalized as percentage
export function PPO(closes: number[], fastPeriod = 12, slowPeriod = 26, signalPeriod = 9): { ppo: number[], signal: number[], histogram: number[] } {
  const fastEMA = EMA(closes, fastPeriod);
  const slowEMA = EMA(closes, slowPeriod);

  const ppoLine: number[] = [];
  for (let i = 0; i < closes.length; i++) {
    if (slowEMA[i] === 0 || isNaN(slowEMA[i])) {
      ppoLine.push(NaN);
    } else {
      ppoLine.push(((fastEMA[i] - slowEMA[i]) / slowEMA[i]) * 100);
    }
  }

  const signalLine = EMA(ppoLine.filter(v => !isNaN(v)), signalPeriod);

  // Pad signal line
  const paddedSignal: number[] = new Array(slowPeriod - 1 + signalPeriod - 1).fill(NaN);
  paddedSignal.push(...signalLine);

  const histogram: number[] = [];
  for (let i = 0; i < closes.length; i++) {
    if (isNaN(ppoLine[i]) || isNaN(paddedSignal[i])) {
      histogram.push(NaN);
    } else {
      histogram.push(ppoLine[i] - paddedSignal[i]);
    }
  }

  return { ppo: ppoLine, signal: paddedSignal, histogram };
}

// True Strength Index (TSI) - Double-smoothed momentum indicator
export function TrueStrengthIndex(closes: number[], longPeriod = 25, shortPeriod = 13, signalPeriod = 7): { tsi: number[], signal: number[] } {
  const priceChanges: number[] = [0];
  const absPriceChanges: number[] = [0];

  for (let i = 1; i < closes.length; i++) {
    priceChanges.push(closes[i] - closes[i - 1]);
    absPriceChanges.push(Math.abs(closes[i] - closes[i - 1]));
  }

  // Double smooth price changes
  const pcEMA1 = EMA(priceChanges, longPeriod);
  const pcEMA2 = EMA(pcEMA1, shortPeriod);

  // Double smooth absolute price changes
  const apcEMA1 = EMA(absPriceChanges, longPeriod);
  const apcEMA2 = EMA(apcEMA1, shortPeriod);

  // TSI = 100 * (Double Smoothed PC / Double Smoothed APC)
  const tsi: number[] = [];
  for (let i = 0; i < closes.length; i++) {
    if (apcEMA2[i] === 0) {
      tsi.push(0);
    } else {
      tsi.push((pcEMA2[i] / apcEMA2[i]) * 100);
    }
  }

  const signal = EMA(tsi, signalPeriod);

  return { tsi, signal };
}

// Know Sure Thing (KST) - Rate of change oscillator with multiple timeframes
export function KnowSureThing(closes: number[]): { kst: number[], signal: number[] } {
  // ROC periods
  const roc1 = ROC(closes, 10);
  const roc2 = ROC(closes, 15);
  const roc3 = ROC(closes, 20);
  const roc4 = ROC(closes, 30);

  // Smooth each ROC with SMA
  const sroc1 = SMA(roc1.map(v => isNaN(v) ? 0 : v), 10);
  const sroc2 = SMA(roc2.map(v => isNaN(v) ? 0 : v), 10);
  const sroc3 = SMA(roc3.map(v => isNaN(v) ? 0 : v), 10);
  const sroc4 = SMA(roc4.map(v => isNaN(v) ? 0 : v), 15);

  // KST = (SROC1 × 1) + (SROC2 × 2) + (SROC3 × 3) + (SROC4 × 4)
  const kst: number[] = [];
  for (let i = 0; i < closes.length; i++) {
    kst.push(sroc1[i] * 1 + sroc2[i] * 2 + sroc3[i] * 3 + sroc4[i] * 4);
  }

  // Signal line is 9-period SMA of KST
  const signal = SMA(kst, 9);

  return { kst, signal };
}

// Connors RSI (CRSI) - Composite of RSI, Up/Down streak, and Rate of Change
export function ConnorsRSI(closes: number[], rsiPeriod = 3, streakPeriod = 2, rocPeriod = 100): number[] {
  // Standard RSI
  const rsi = RSI_Simple(closes, rsiPeriod);

  // Calculate streak (consecutive up/down days)
  const streaks: number[] = [0];
  for (let i = 1; i < closes.length; i++) {
    if (closes[i] > closes[i - 1]) {
      streaks.push(streaks[i - 1] > 0 ? streaks[i - 1] + 1 : 1);
    } else if (closes[i] < closes[i - 1]) {
      streaks.push(streaks[i - 1] < 0 ? streaks[i - 1] - 1 : -1);
    } else {
      streaks.push(0);
    }
  }

  // RSI of streaks
  const streakRSI = RSI_Simple(streaks, streakPeriod);

  // Percent rank of ROC
  const roc = ROC(closes, 1);
  const percentRank: number[] = [];
  for (let i = 0; i < closes.length; i++) {
    if (i < rocPeriod) {
      percentRank.push(NaN);
    } else {
      const slice = roc.slice(i - rocPeriod, i).filter(v => !isNaN(v));
      const count = slice.filter(v => v < roc[i]).length;
      percentRank.push((count / slice.length) * 100);
    }
  }

  // CRSI = (RSI + StreakRSI + PercentRank) / 3
  const crsi: number[] = [];
  for (let i = 0; i < closes.length; i++) {
    if (isNaN(rsi[i]) || isNaN(streakRSI[i]) || isNaN(percentRank[i])) {
      crsi.push(NaN);
    } else {
      crsi.push((rsi[i] + streakRSI[i] + percentRank[i]) / 3);
    }
  }

  return crsi;
}

// Balance of Power (BOP) - Measures strength of buyers vs sellers
export function BalanceOfPower(candles: Candle[], period = 14): number[] {
  const rawBOP: number[] = [];

  for (const c of candles) {
    const range = c.high - c.low;
    rawBOP.push(range === 0 ? 0 : (c.close - c.open) / range);
  }

  return SMA(rawBOP, period);
}

// ============ V11 NEW INDICATORS - ITERATION 67 ============

// Ichimoku Cloud - Complete implementation for crypto
// Tenkan-sen (Conversion Line), Kijun-sen (Base Line), Senkou Span A/B (Leading Spans), Chikou Span
export interface IchimokuResult {
  tenkan: number[];      // Conversion Line (9-period)
  kijun: number[];       // Base Line (26-period)
  senkouA: number[];     // Leading Span A
  senkouB: number[];     // Leading Span B
  chikou: number[];      // Lagging Span
  cloudTop: number[];    // Top of cloud (max of senkouA, senkouB)
  cloudBottom: number[]; // Bottom of cloud (min of senkouA, senkouB)
  cloudBullish: boolean[];  // Is cloud bullish (senkouA > senkouB)
}

export function IchimokuCloud(
  candles: Candle[],
  tenkanPeriod = 9,
  kijunPeriod = 26,
  senkouBPeriod = 52,
  displacement = 26
): IchimokuResult {
  const len = candles.length;
  const tenkan: number[] = [];
  const kijun: number[] = [];
  const senkouA: number[] = [];
  const senkouB: number[] = [];
  const chikou: number[] = [];
  const cloudTop: number[] = [];
  const cloudBottom: number[] = [];
  const cloudBullish: boolean[] = [];

  // Helper function to get midpoint of high-low range
  const getMidpoint = (start: number, end: number): number => {
    let highest = -Infinity;
    let lowest = Infinity;
    for (let j = start; j <= end; j++) {
      if (candles[j].high > highest) highest = candles[j].high;
      if (candles[j].low < lowest) lowest = candles[j].low;
    }
    return (highest + lowest) / 2;
  };

  for (let i = 0; i < len; i++) {
    // Tenkan-sen (Conversion Line)
    if (i >= tenkanPeriod - 1) {
      tenkan.push(getMidpoint(i - tenkanPeriod + 1, i));
    } else {
      tenkan.push(NaN);
    }

    // Kijun-sen (Base Line)
    if (i >= kijunPeriod - 1) {
      kijun.push(getMidpoint(i - kijunPeriod + 1, i));
    } else {
      kijun.push(NaN);
    }

    // Senkou Span B (52-period midpoint, plotted 26 periods ahead)
    if (i >= senkouBPeriod - 1) {
      senkouB.push(getMidpoint(i - senkouBPeriod + 1, i));
    } else {
      senkouB.push(NaN);
    }

    // Chikou Span (current close, plotted 26 periods back)
    chikou.push(candles[i].close);
  }

  // Senkou Span A (average of Tenkan and Kijun, plotted 26 periods ahead)
  for (let i = 0; i < len; i++) {
    if (!isNaN(tenkan[i]) && !isNaN(kijun[i])) {
      senkouA.push((tenkan[i] + kijun[i]) / 2);
    } else {
      senkouA.push(NaN);
    }
  }

  // Calculate cloud top/bottom and bullish/bearish status
  for (let i = 0; i < len; i++) {
    // For current price, use the spans from displacement periods ago
    const spanIdx = i - displacement;
    if (spanIdx >= 0 && !isNaN(senkouA[spanIdx]) && !isNaN(senkouB[spanIdx])) {
      cloudTop.push(Math.max(senkouA[spanIdx], senkouB[spanIdx]));
      cloudBottom.push(Math.min(senkouA[spanIdx], senkouB[spanIdx]));
      cloudBullish.push(senkouA[spanIdx] > senkouB[spanIdx]);
    } else {
      cloudTop.push(NaN);
      cloudBottom.push(NaN);
      cloudBullish.push(false);
    }
  }

  return { tenkan, kijun, senkouA, senkouB, chikou, cloudTop, cloudBottom, cloudBullish };
}

// VWAP with Standard Deviation Bands
export interface VWAPBandsResult {
  vwap: number[];
  upperBand1: number[];  // +1 std dev
  lowerBand1: number[];  // -1 std dev
  upperBand2: number[];  // +2 std dev
  lowerBand2: number[];  // -2 std dev
  upperBand3: number[];  // +3 std dev (for crypto volatility)
  lowerBand3: number[];  // -3 std dev
}

export function VWAPBands(candles: Candle[], multipliers = [1, 2, 3]): VWAPBandsResult {
  const len = candles.length;
  const vwap: number[] = [];
  const upperBand1: number[] = [];
  const lowerBand1: number[] = [];
  const upperBand2: number[] = [];
  const lowerBand2: number[] = [];
  const upperBand3: number[] = [];
  const lowerBand3: number[] = [];

  let cumulativeTPV = 0;
  let cumulativeVolume = 0;
  let cumulativeTPVSquared = 0;

  for (let i = 0; i < len; i++) {
    const typicalPrice = (candles[i].high + candles[i].low + candles[i].close) / 3;
    cumulativeTPV += typicalPrice * candles[i].volume;
    cumulativeVolume += candles[i].volume;
    cumulativeTPVSquared += typicalPrice * typicalPrice * candles[i].volume;

    if (cumulativeVolume === 0) {
      vwap.push(typicalPrice);
      upperBand1.push(NaN);
      lowerBand1.push(NaN);
      upperBand2.push(NaN);
      lowerBand2.push(NaN);
      upperBand3.push(NaN);
      lowerBand3.push(NaN);
      continue;
    }

    const currentVwap = cumulativeTPV / cumulativeVolume;
    vwap.push(currentVwap);

    // Calculate standard deviation
    const variance = (cumulativeTPVSquared / cumulativeVolume) - (currentVwap * currentVwap);
    const stdDev = Math.sqrt(Math.max(0, variance));

    upperBand1.push(currentVwap + multipliers[0] * stdDev);
    lowerBand1.push(currentVwap - multipliers[0] * stdDev);
    upperBand2.push(currentVwap + multipliers[1] * stdDev);
    lowerBand2.push(currentVwap - multipliers[1] * stdDev);
    upperBand3.push(currentVwap + multipliers[2] * stdDev);
    lowerBand3.push(currentVwap - multipliers[2] * stdDev);
  }

  return { vwap, upperBand1, lowerBand1, upperBand2, lowerBand2, upperBand3, lowerBand3 };
}

// Rolling VWAP (for continuous calculation without session resets - ideal for crypto)
export function RollingVWAP(candles: Candle[], period = 21): number[] {
  const result: number[] = [];

  for (let i = 0; i < candles.length; i++) {
    if (i < period - 1) {
      result.push(NaN);
      continue;
    }

    let sumTPV = 0;
    let sumVolume = 0;

    for (let j = i - period + 1; j <= i; j++) {
      const tp = (candles[j].high + candles[j].low + candles[j].close) / 3;
      sumTPV += tp * candles[j].volume;
      sumVolume += candles[j].volume;
    }

    result.push(sumVolume === 0 ? candles[i].close : sumTPV / sumVolume);
  }

  return result;
}

// Market Structure Detection - BOS (Break of Structure) and CHoCH (Change of Character)
export interface MarketStructureResult {
  swingHighs: number[];       // Swing high values (NaN where not a swing high)
  swingLows: number[];        // Swing low values (NaN where not a swing low)
  trend: number[];            // 1 = uptrend, -1 = downtrend, 0 = undefined
  bos: number[];              // 1 = bullish BOS, -1 = bearish BOS, 0 = none
  choch: number[];            // 1 = bullish CHoCH, -1 = bearish CHoCH, 0 = none
  lastSwingHigh: number[];    // Last confirmed swing high price
  lastSwingLow: number[];     // Last confirmed swing low price
}

export function MarketStructure(candles: Candle[], swingLookback = 5): MarketStructureResult {
  const len = candles.length;
  const swingHighs: number[] = new Array(len).fill(NaN);
  const swingLows: number[] = new Array(len).fill(NaN);
  const trend: number[] = new Array(len).fill(0);
  const bos: number[] = new Array(len).fill(0);
  const choch: number[] = new Array(len).fill(0);
  const lastSwingHigh: number[] = new Array(len).fill(NaN);
  const lastSwingLow: number[] = new Array(len).fill(NaN);

  let currentTrend = 0;
  let prevSwingHigh = NaN;
  let prevSwingLow = NaN;
  let lastHighIdx = -1;
  let lastLowIdx = -1;

  for (let i = swingLookback; i < len - swingLookback; i++) {
    // Detect swing high
    let isSwingHigh = true;
    for (let j = 1; j <= swingLookback; j++) {
      if (candles[i].high <= candles[i - j].high || candles[i].high <= candles[i + j].high) {
        isSwingHigh = false;
        break;
      }
    }

    // Detect swing low
    let isSwingLow = true;
    for (let j = 1; j <= swingLookback; j++) {
      if (candles[i].low >= candles[i - j].low || candles[i].low >= candles[i + j].low) {
        isSwingLow = false;
        break;
      }
    }

    if (isSwingHigh) {
      swingHighs[i] = candles[i].high;

      // Check for BOS or CHoCH
      if (!isNaN(prevSwingHigh)) {
        if (candles[i].high > prevSwingHigh) {
          // Higher high
          if (currentTrend === 1) {
            bos[i] = 1; // Bullish BOS (continuation)
          } else if (currentTrend === -1) {
            choch[i] = 1; // Bullish CHoCH (reversal)
            currentTrend = 1;
          } else {
            currentTrend = 1;
          }
        }
      }

      prevSwingHigh = candles[i].high;
      lastHighIdx = i;
    }

    if (isSwingLow) {
      swingLows[i] = candles[i].low;

      // Check for BOS or CHoCH
      if (!isNaN(prevSwingLow)) {
        if (candles[i].low < prevSwingLow) {
          // Lower low
          if (currentTrend === -1) {
            bos[i] = -1; // Bearish BOS (continuation)
          } else if (currentTrend === 1) {
            choch[i] = -1; // Bearish CHoCH (reversal)
            currentTrend = -1;
          } else {
            currentTrend = -1;
          }
        }
      }

      prevSwingLow = candles[i].low;
      lastLowIdx = i;
    }

    trend[i] = currentTrend;
    lastSwingHigh[i] = prevSwingHigh;
    lastSwingLow[i] = prevSwingLow;
  }

  // Fill remaining values
  for (let i = len - swingLookback; i < len; i++) {
    trend[i] = currentTrend;
    lastSwingHigh[i] = prevSwingHigh;
    lastSwingLow[i] = prevSwingLow;
  }

  return { swingHighs, swingLows, trend, bos, choch, lastSwingHigh, lastSwingLow };
}

// Pivot Points (for support/resistance)
export interface PivotPointsResult {
  pivot: number;
  r1: number;  // Resistance 1
  r2: number;  // Resistance 2
  r3: number;  // Resistance 3
  s1: number;  // Support 1
  s2: number;  // Support 2
  s3: number;  // Support 3
}

export function PivotPoints(high: number, low: number, close: number): PivotPointsResult {
  const pivot = (high + low + close) / 3;
  const range = high - low;

  return {
    pivot,
    r1: 2 * pivot - low,
    r2: pivot + range,
    r3: pivot + 2 * range,
    s1: 2 * pivot - high,
    s2: pivot - range,
    s3: pivot - 2 * range,
  };
}

// Average Directional Movement Rating (enhanced ADX)
export function ADXRating(candles: Candle[], period = 14): { adxr: number[], rating: string[] } {
  const { adx } = ADX(candles, period);
  const adxr: number[] = [];
  const rating: string[] = [];

  for (let i = 0; i < candles.length; i++) {
    if (i < period * 2) {
      adxr.push(NaN);
      rating.push('none');
    } else {
      const avgAdx = (adx[i] + adx[i - period]) / 2;
      adxr.push(avgAdx);

      if (avgAdx >= 50) rating.push('very_strong');
      else if (avgAdx >= 40) rating.push('strong');
      else if (avgAdx >= 25) rating.push('trending');
      else if (avgAdx >= 20) rating.push('weak');
      else rating.push('ranging');
    }
  }

  return { adxr, rating };
}

// Squeeze Momentum Indicator (TTM Squeeze variant)
// Detects when BB is inside Keltner Channel (squeeze condition)
export interface SqueezeMomentumResult {
  squeeze: boolean[];       // true when in squeeze (low volatility)
  momentum: number[];       // momentum histogram value
  momentumColor: string[];  // 'lime' | 'green' | 'red' | 'maroon' for momentum direction
}

export function SqueezeMomentum(
  candles: Candle[],
  bbPeriod = 20,
  bbMult = 2,
  kcPeriod = 20,
  kcMult = 1.5
): SqueezeMomentumResult {
  const len = candles.length;
  const closes = candles.map(c => c.close);

  // Calculate Bollinger Bands
  const bb = BollingerBands(closes, bbPeriod, bbMult);

  // Calculate Keltner Channels
  const kc = KeltnerChannel(candles, kcPeriod, kcPeriod, kcMult);

  // Calculate momentum using linear regression
  const hlc3 = candles.map(c => (c.high + c.low + c.close) / 3);
  const momentum: number[] = [];

  const squeeze: boolean[] = [];
  const momentumColor: string[] = [];

  for (let i = 0; i < len; i++) {
    // Squeeze detection: BB inside KC
    if (!isNaN(bb.upper[i]) && !isNaN(kc.upper[i])) {
      squeeze.push(bb.lower[i] > kc.lower[i] && bb.upper[i] < kc.upper[i]);
    } else {
      squeeze.push(false);
    }

    // Momentum calculation (simplified - using delta from regression line)
    if (i < bbPeriod) {
      momentum.push(0);
      momentumColor.push('lime');
    } else {
      // Simplified momentum: price relative to midline
      const midline = (bb.upper[i] + bb.lower[i]) / 2;
      const val = closes[i] - midline;
      momentum.push(val);

      // Color based on momentum direction and acceleration
      const prevVal = momentum[i - 1] || 0;
      if (val >= 0) {
        momentumColor.push(val > prevVal ? 'lime' : 'green');
      } else {
        momentumColor.push(val < prevVal ? 'maroon' : 'red');
      }
    }
  }

  return { squeeze, momentum, momentumColor };
}

// Volume Momentum Oscillator
export function VolumeMomentumOscillator(candles: Candle[], period = 14): number[] {
  const result: number[] = [];
  const volumes = candles.map(c => c.volume);

  for (let i = 0; i < candles.length; i++) {
    if (i < period) {
      result.push(NaN);
    } else {
      const currentVol = volumes[i];
      const prevVol = volumes[i - period];
      result.push(prevVol === 0 ? 0 : ((currentVol - prevVol) / prevVol) * 100);
    }
  }

  return result;
}

// Accumulation/Distribution Line
export function AccumulationDistribution(candles: Candle[]): number[] {
  const result: number[] = [];
  let ad = 0;

  for (const c of candles) {
    const clv = c.high === c.low ? 0 : ((c.close - c.low) - (c.high - c.close)) / (c.high - c.low);
    ad += clv * c.volume;
    result.push(ad);
  }

  return result;
}

// Price Momentum Score (combines multiple momentum indicators)
export function PriceMomentumScore(candles: Candle[], period = 14): number[] {
  const closes = candles.map(c => c.close);
  const rsi = RSI_Simple(closes, period);
  const roc = ROC(closes, period);
  const { tsi } = TrueStrengthIndex(closes, 25, 13, 7);

  const result: number[] = [];

  for (let i = 0; i < candles.length; i++) {
    if (isNaN(rsi[i]) || isNaN(roc[i]) || isNaN(tsi[i])) {
      result.push(NaN);
    } else {
      // Normalize each to 0-100 range and average
      const rsiNorm = rsi[i];
      const rocNorm = Math.max(0, Math.min(100, 50 + roc[i])); // Center ROC at 50
      const tsiNorm = Math.max(0, Math.min(100, 50 + tsi[i] / 2)); // Center TSI at 50

      result.push((rsiNorm + rocNorm + tsiNorm) / 3);
    }
  }

  return result;
}

// Trend Intensity Index
export function TrendIntensityIndex(closes: number[], period = 14): number[] {
  const result: number[] = [];
  const sma = SMA(closes, period);

  for (let i = 0; i < closes.length; i++) {
    if (i < period * 2 || isNaN(sma[i])) {
      result.push(NaN);
    } else {
      let upCount = 0;
      let downCount = 0;

      for (let j = i - period + 1; j <= i; j++) {
        if (closes[j] > sma[j]) upCount++;
        else if (closes[j] < sma[j]) downCount++;
      }

      const total = upCount + downCount;
      result.push(total === 0 ? 50 : (upCount / total) * 100);
    }
  }

  return result;
}

// ============ V12 NEW INDICATORS - ITERATION 1 (2025-12-14) ============

// KDJ Indicator - Enhanced stochastic oscillator with J line
// Standard settings: 9,3,3 - K smoothing, D smoothing
// K = RSV smoothed (RSV = Raw Stochastic Value)
// D = K smoothed
// J = 3*K - 2*D (signals early reversals)
export interface KDJResult {
  k: number[];
  d: number[];
  j: number[];
}

export function KDJ(candles: Candle[], kPeriod = 9, dPeriod = 3, jSmooth = 3): KDJResult {
  const len = candles.length;
  const rsv: number[] = [];
  const k: number[] = [];
  const d: number[] = [];
  const j: number[] = [];

  // Calculate RSV (Raw Stochastic Value)
  for (let i = 0; i < len; i++) {
    if (i < kPeriod - 1) {
      rsv.push(NaN);
      k.push(50); // Initialize K at 50
      d.push(50); // Initialize D at 50
      j.push(50); // Initialize J at 50
    } else {
      const slice = candles.slice(i - kPeriod + 1, i + 1);
      const highestHigh = Math.max(...slice.map(c => c.high));
      const lowestLow = Math.min(...slice.map(c => c.low));
      const range = highestHigh - lowestLow;

      const currentRSV = range === 0 ? 50 : ((candles[i].close - lowestLow) / range) * 100;
      rsv.push(currentRSV);

      // K = (prev K * (dPeriod-1) + RSV) / dPeriod (Wilder's smoothing)
      const prevK = k[i - 1] || 50;
      const currentK = (prevK * (dPeriod - 1) + currentRSV) / dPeriod;
      k.push(currentK);

      // D = (prev D * (jSmooth-1) + K) / jSmooth
      const prevD = d[i - 1] || 50;
      const currentD = (prevD * (jSmooth - 1) + currentK) / jSmooth;
      d.push(currentD);

      // J = 3*K - 2*D (can go above 100 or below 0)
      const currentJ = 3 * currentK - 2 * currentD;
      j.push(currentJ);
    }
  }

  return { k, d, j };
}

// Adaptive ATR Channels - ATR-based dynamic bands
// Better than Bollinger Bands for trending markets
export interface AdaptiveATRChannelResult {
  upper: number[];
  middle: number[];
  lower: number[];
  atr: number[];
  bandwidth: number[];  // Relative bandwidth for squeeze detection
}

export function AdaptiveATRChannels(
  candles: Candle[],
  emaPeriod = 20,
  atrPeriod = 14,
  multiplier = 2
): AdaptiveATRChannelResult {
  const closes = candles.map(c => c.close);
  const middle = EMA(closes, emaPeriod);
  const atr = ATR(candles, atrPeriod);

  const upper: number[] = [];
  const lower: number[] = [];
  const bandwidth: number[] = [];

  for (let i = 0; i < candles.length; i++) {
    if (isNaN(middle[i]) || isNaN(atr[i])) {
      upper.push(NaN);
      lower.push(NaN);
      bandwidth.push(NaN);
    } else {
      const band = multiplier * atr[i];
      upper.push(middle[i] + band);
      lower.push(middle[i] - band);
      bandwidth.push((band * 2) / middle[i] * 100); // Bandwidth as % of price
    }
  }

  return { upper, middle, lower, atr, bandwidth };
}

// Volume Surge Detector - Identifies significant volume spikes
// Returns normalized volume ratio and surge detection
export interface VolumeSurgeResult {
  volumeRatio: number[];     // Current volume / avg volume
  isSurge: number[];         // 1 if surge, 0 if not
  direction: number[];       // 1 if bullish surge, -1 if bearish surge, 0 neutral
  avgVolume: number[];
}

export function VolumeSurge(candles: Candle[], period = 20, threshold = 1.5): VolumeSurgeResult {
  const volumes = candles.map(c => c.volume);
  const avgVolume = SMA(volumes, period);
  const volumeRatio: number[] = [];
  const isSurge: number[] = [];
  const direction: number[] = [];

  for (let i = 0; i < candles.length; i++) {
    if (isNaN(avgVolume[i]) || avgVolume[i] === 0) {
      volumeRatio.push(NaN);
      isSurge.push(0);
      direction.push(0);
    } else {
      const ratio = volumes[i] / avgVolume[i];
      volumeRatio.push(ratio);
      isSurge.push(ratio >= threshold ? 1 : 0);

      // Determine direction based on candle
      if (ratio >= threshold) {
        if (candles[i].close > candles[i].open) {
          direction.push(1);  // Bullish surge
        } else if (candles[i].close < candles[i].open) {
          direction.push(-1); // Bearish surge
        } else {
          direction.push(0);
        }
      } else {
        direction.push(0);
      }
    }
  }

  return { volumeRatio, isSurge, direction, avgVolume };
}

// Rate of Change Momentum with Signal Line
export interface ROCMomentumResult {
  roc: number[];
  signal: number[];
  histogram: number[];
}

export function ROCMomentum(closes: number[], rocPeriod = 10, signalPeriod = 5): ROCMomentumResult {
  const roc = ROC(closes, rocPeriod);
  const signal = EMA(roc.map(v => isNaN(v) ? 0 : v), signalPeriod);
  const histogram: number[] = [];

  for (let i = 0; i < closes.length; i++) {
    if (isNaN(roc[i]) || isNaN(signal[i])) {
      histogram.push(NaN);
    } else {
      histogram.push(roc[i] - signal[i]);
    }
  }

  return { roc, signal, histogram };
}

// Money Flow Trend - Combines CMF with price trend
export function MoneyFlowTrend(candles: Candle[], period = 20): number[] {
  const cmf = CMF(candles, period);
  const closes = candles.map(c => c.close);
  const ema = EMA(closes, period);
  const result: number[] = [];

  for (let i = 0; i < candles.length; i++) {
    if (isNaN(cmf[i]) || isNaN(ema[i])) {
      result.push(NaN);
    } else {
      // Combine CMF signal with price position relative to EMA
      const priceStrength = (closes[i] - ema[i]) / ema[i] * 100;
      // Weighted combination: CMF is -1 to 1, scale to match price strength
      result.push(cmf[i] * 50 + priceStrength);
    }
  }

  return result;
}
