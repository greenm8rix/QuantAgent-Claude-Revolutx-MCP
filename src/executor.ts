// Trade Executor - Executes winning strategies in real-time
// Auto-loads best strategies from top_strategies.json (backtest results)
import * as api from "./utils/revolut-api.js";
import * as indicators from "./indicators/index.js";
import type { Candle } from "./indicators/index.js";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath, pathToFileURL } from "url";
import type { Strategy, Signal } from "./strategies/index.js";
// Old strategy-lab.ts system removed - only using modular strategies from winners.json

// Modular strategy winner entry
interface WinnerEntry {
  file: string;
  symbols: string[];
  interval: number;
}

// ============ DYNAMIC RISK PROFILES ============
// Strategy types and their risk characteristics
type StrategyType = "scalping" | "trend" | "mean_reversion" | "momentum" | "breakout" | "default";

interface RiskProfile {
  atrMultiplierSL: number;  // ATR multiplier for stop loss
  atrMultiplierTP: number;  // ATR multiplier for take profit
  minSLPercent: number;     // Minimum SL (floor)
  maxSLPercent: number;     // Maximum SL (ceiling)
  minTPPercent: number;     // Minimum TP
  maxTPPercent: number;     // Maximum TP
}

// Risk profiles optimized for each strategy type
const RISK_PROFILES: Record<StrategyType, RiskProfile> = {
  scalping: {
    atrMultiplierSL: 1.0,   // Tight stops for quick trades
    atrMultiplierTP: 1.5,   // Small targets, high win rate
    minSLPercent: 0.5,
    maxSLPercent: 2.0,
    minTPPercent: 0.8,
    maxTPPercent: 3.0,
  },
  trend: {
    atrMultiplierSL: 2.0,   // Wide stops to ride trends
    atrMultiplierTP: 4.0,   // Let winners run
    minSLPercent: 2.0,
    maxSLPercent: 8.0,
    minTPPercent: 4.0,
    maxTPPercent: 20.0,
  },
  mean_reversion: {
    atrMultiplierSL: 1.5,   // Medium stops
    atrMultiplierTP: 2.0,   // Targets near mean
    minSLPercent: 1.0,
    maxSLPercent: 4.0,
    minTPPercent: 1.5,
    maxTPPercent: 6.0,
  },
  momentum: {
    atrMultiplierSL: 1.5,   // Medium-tight stops
    atrMultiplierTP: 3.0,   // Capture momentum moves
    minSLPercent: 1.5,
    maxSLPercent: 5.0,
    minTPPercent: 3.0,
    maxTPPercent: 12.0,
  },
  breakout: {
    atrMultiplierSL: 1.2,   // Tight stops below breakout
    atrMultiplierTP: 3.5,   // Big targets on breakouts
    minSLPercent: 1.0,
    maxSLPercent: 4.0,
    minTPPercent: 3.0,
    maxTPPercent: 15.0,
  },
  default: {
    atrMultiplierSL: 1.5,
    atrMultiplierTP: 3.0,
    minSLPercent: 2.0,
    maxSLPercent: 5.0,
    minTPPercent: 4.0,
    maxTPPercent: 10.0,
  },
};

// Detect strategy type from strategy ID
function detectStrategyType(strategyId: string): StrategyType {
  const id = strategyId.toLowerCase();

  // Scalping strategies
  if (id.includes("scalp") || id.includes("micro") || id.includes("fast_ema") ||
      id.includes("stoch_scalp") || id.includes("candle_scalp") || id.includes("volatility_scalp")) {
    return "scalping";
  }

  // Trend following strategies
  if (id.includes("trend") || id.includes("supertrend") || id.includes("hull_ma") ||
      id.includes("ema_ribbon") || id.includes("adx_di") || id.includes("parabolic_sar") ||
      id.includes("ichimoku") || id.includes("elder")) {
    return "trend";
  }

  // Mean reversion strategies
  if (id.includes("bounce") || id.includes("rsi_bb") || id.includes("bb_bounce") ||
      id.includes("mean_reversion") || id.includes("channel_position") || id.includes("williams_r")) {
    return "mean_reversion";
  }

  // Momentum strategies
  if (id.includes("momentum") || id.includes("macd") || id.includes("rsi_momentum") ||
      id.includes("roc") || id.includes("cci") || id.includes("ao_") || id.includes("cmo")) {
    return "momentum";
  }

  // Breakout strategies
  if (id.includes("breakout") || id.includes("donchian") || id.includes("keltner") ||
      id.includes("squeeze") || id.includes("range_breakout") || id.includes("aroon")) {
    return "breakout";
  }

  return "default";
}

// ATR cache to avoid recalculating
const atrCache: Map<string, { atr: number; timestamp: number }> = new Map();
const ATR_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// Calculate ATR from candles
function calculateATR(candles: Candle[], period: number = 14): number {
  if (candles.length < period + 1) return 0;

  const trueRanges: number[] = [];

  for (let i = 1; i < candles.length; i++) {
    const high = candles[i].high;
    const low = candles[i].low;
    const prevClose = candles[i - 1].close;

    // True Range = max(high - low, |high - prevClose|, |low - prevClose|)
    const tr = Math.max(
      high - low,
      Math.abs(high - prevClose),
      Math.abs(low - prevClose)
    );
    trueRanges.push(tr);
  }

  // Calculate simple average of last 'period' true ranges
  const recentTRs = trueRanges.slice(-period);
  const atr = recentTRs.reduce((sum, tr) => sum + tr, 0) / recentTRs.length;

  return atr;
}

// Calculate dynamic SL/TP based on ATR and strategy type
interface DynamicSLTP {
  stopLossPercent: number;
  takeProfitPercent: number;
  strategyType: StrategyType;
  atr: number;
  atrPercent: number;
}

function calculateDynamicSLTP(
  price: number,
  atr: number,
  strategyId: string
): DynamicSLTP {
  const strategyType = detectStrategyType(strategyId);
  const profile = RISK_PROFILES[strategyType];

  // ATR as percentage of price
  const atrPercent = (atr / price) * 100;

  // Calculate SL/TP using ATR multipliers
  let stopLossPercent = atrPercent * profile.atrMultiplierSL;
  let takeProfitPercent = atrPercent * profile.atrMultiplierTP;

  // Clamp to min/max bounds
  stopLossPercent = Math.max(profile.minSLPercent, Math.min(profile.maxSLPercent, stopLossPercent));
  takeProfitPercent = Math.max(profile.minTPPercent, Math.min(profile.maxTPPercent, takeProfitPercent));

  return {
    stopLossPercent,
    takeProfitPercent,
    strategyType,
    atr,
    atrPercent,
  };
}

export interface Position {
  symbol: string;
  side: "long" | "short";
  entryPrice: number;
  entryTime: number;
  quantity: number;
  strategyId: string;
  stopLoss?: number;
  takeProfit?: number;
  strategyType?: StrategyType;  // Track strategy type
  atrAtEntry?: number;          // ATR when position opened
}

// Trade history record for Claude analysis
export interface TradeHistoryRecord {
  symbol: string;
  side: "long" | "short";
  entryPrice: number;
  exitPrice: number;
  pnl: number;
  pnlPercent: number;
  reason: string;  // stop_loss, take_profit, signal_reversal
  strategyId: string;
  strategyType: string;
  entryTime: number;
  exitTime: number;
  atrAtEntry?: number;
  stopLoss?: number;
  takeProfit?: number;
  duration: number;  // milliseconds
}

export interface ExecutorConfig {
  maxPositions: number;
  positionSizePercent: number;
  stopLossPercent: number;
  takeProfitPercent: number;
  maxDailyLossPercent: number;
  tradingSymbols: string[];
  interval: number; // candle interval in minutes
  paperTrading: boolean; // Simulate trades without real orders
  simulatedBalance: number; // Starting balance for paper trading
}

const DEFAULT_CONFIG: ExecutorConfig = {
  maxPositions: 10, // Increased for more diverse portfolio
  positionSizePercent: 5, // 5% per trade
  stopLossPercent: 3, // 3% stop loss
  takeProfitPercent: 6, // 6% take profit (2:1 RR)
  maxDailyLossPercent: 20, // Stop trading after 20% daily loss
  tradingSymbols: [], // Will be populated dynamically from profitable backtest results
  interval: 5, // 5 minute candles (minimum supported)
  paperTrading: false, // Real orders (will fail but tracked)
  simulatedBalance: 100, // $100 simulated tracking
};

// Cooldown entry to prevent repeated losses
interface CooldownEntry {
  symbol: string;
  strategyId: string;
  until: number;
  reason: string;
  consecutiveLosses: number;
}

export class Executor {
  private config: ExecutorConfig;
  private positions: Map<string, Position> = new Map();
  private dailyPnL = 0;
  private startingBalance = 0;
  private isRunning = false;

  // ONLY modular strategies from winners.json (Claude-created)
  private modularStrategies: Map<string, { strategy: Strategy; symbols: string[]; interval: number }> = new Map();


  // Risk management: Cooldown system to prevent death spirals
  private cooldowns: Map<string, CooldownEntry> = new Map();
  private readonly COOLDOWN_MINUTES = 30;  // 30 min pause after repeated losses
  private readonly MAX_CONSECUTIVE_LOSSES = 2;  // Max losses before cooldown

  // Rate limiting: Conservative 2s between API calls
  private readonly RATE_LIMIT_MS = 2000;
  private lastApiCall: number = 0;

  // Rate limiter helper
  private async rateLimit(): Promise<void> {
    const elapsed = Date.now() - this.lastApiCall;
    if (elapsed < this.RATE_LIMIT_MS) {
      await new Promise(r => setTimeout(r, this.RATE_LIMIT_MS - elapsed));
    }
    this.lastApiCall = Date.now();
  }

  constructor(config: Partial<ExecutorConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.loadPositions(); // Load any saved positions on startup
  }

  // Save positions to file for status checking
  // Trade history for Claude analysis
  private tradeHistory: TradeHistoryRecord[] = [];

  private savePositions(): void {
    const positionsFile = path.join(process.cwd(), "positions.json");
    const data = {
      positions: Array.from(this.positions.values()),
      history: this.tradeHistory,
      dailyPnL: this.dailyPnL,
      startingBalance: this.startingBalance,
      updatedAt: Date.now(),
    };
    fs.writeFileSync(positionsFile, JSON.stringify(data, null, 2));
  }

  // Add closed trade to history for Claude analysis
  private addToTradeHistory(
    position: Position,
    exitPrice: number,
    pnl: number,
    pnlPercent: number,
    reason: string
  ): void {
    const record: TradeHistoryRecord = {
      symbol: position.symbol,
      side: position.side,
      entryPrice: position.entryPrice,
      exitPrice,
      pnl,
      pnlPercent,
      reason,
      strategyId: position.strategyId,
      strategyType: position.strategyType || "default",
      entryTime: position.entryTime,
      exitTime: Date.now(),
      atrAtEntry: position.atrAtEntry,
      stopLoss: position.stopLoss,
      takeProfit: position.takeProfit,
      duration: Date.now() - position.entryTime,
    };

    this.tradeHistory.push(record);

    // Keep only last 500 trades to prevent file bloat
    if (this.tradeHistory.length > 500) {
      this.tradeHistory = this.tradeHistory.slice(-500);
    }

    // RISK MANAGEMENT: Track consecutive losses and set cooldown
    if (reason === "stop_loss") {
      const cooldownKey = `${position.symbol}_${position.strategyId}`;
      const current = this.cooldowns.get(cooldownKey);
      const losses = (current?.consecutiveLosses || 0) + 1;

      console.log(`  ⚠️ Stop loss hit! Consecutive losses: ${losses}/${this.MAX_CONSECUTIVE_LOSSES}`);

      if (losses >= this.MAX_CONSECUTIVE_LOSSES) {
        const cooldownUntil = Date.now() + this.COOLDOWN_MINUTES * 60 * 1000;
        this.cooldowns.set(cooldownKey, {
          symbol: position.symbol,
          strategyId: position.strategyId,
          until: cooldownUntil,
          reason: `${losses} consecutive stop losses`,
          consecutiveLosses: losses
        });
        console.log(`  🚫 COOLDOWN ACTIVATED: ${position.symbol}+${position.strategyId} paused for ${this.COOLDOWN_MINUTES} minutes`);
      } else {
        // Update loss count without full cooldown yet
        this.cooldowns.set(cooldownKey, {
          symbol: position.symbol,
          strategyId: position.strategyId,
          until: 0, // No cooldown yet
          reason: `${losses} consecutive losses`,
          consecutiveLosses: losses
        });
      }
    } else if (reason === "take_profit" || (pnl > 0)) {
      // Reset consecutive losses on profit
      const cooldownKey = `${position.symbol}_${position.strategyId}`;
      if (this.cooldowns.has(cooldownKey)) {
        console.log(`  ✅ Profit! Resetting consecutive loss counter for ${cooldownKey}`);
        this.cooldowns.delete(cooldownKey);
      }
    }
  }

  // Load positions and history from file (for crash recovery)
  private loadPositions(): void {
    const positionsFile = path.join(process.cwd(), "positions.json");
    if (fs.existsSync(positionsFile)) {
      try {
        const data = JSON.parse(fs.readFileSync(positionsFile, "utf-8"));
        // Always load history (it's persistent)
        this.tradeHistory = data.history || [];

        // Only load active positions if less than 1 hour old
        if (Date.now() - data.updatedAt < 60 * 60 * 1000) {
          for (const pos of data.positions) {
            this.positions.set(pos.symbol, pos);
          }
          this.dailyPnL = data.dailyPnL || 0;
          console.log(`Loaded ${this.positions.size} positions and ${this.tradeHistory.length} history records`);
        } else {
          console.log(`Loaded ${this.tradeHistory.length} history records (positions expired)`);
        }
      } catch (e) {
        // Ignore errors loading positions
      }
    }
  }

  // Load modular strategies from winners.json (ONLY source of strategies)
  async loadModularStrategies(): Promise<void> {
    const winnersPath = path.join(process.cwd(), "src", "strategies", "winners.json");

    if (!fs.existsSync(winnersPath)) {
      console.log("\nNo modular strategies (winners.json not found)");
      return;
    }

    try {
      const winnersData = JSON.parse(fs.readFileSync(winnersPath, "utf-8"));
      const winners: WinnerEntry[] = winnersData.strategies || [];

      if (winners.length === 0) {
        console.log("\nNo modular strategies registered in winners.json");
        return;
      }

      console.log(`\n=== Loading ${winners.length} Modular Strategies ===\n`);

      for (const winner of winners) {
        try {
          const strategyPath = path.join(process.cwd(), "src", "strategies", winner.file);

          if (!fs.existsSync(strategyPath)) {
            console.log(`  ⚠️ Strategy file not found: ${winner.file}`);
            continue;
          }

          // Dynamic import of the strategy (use file:// URL for Windows compatibility)
          const moduleUrl = pathToFileURL(strategyPath).href;
          const module = await import(moduleUrl);
          const strategy = module.default as Strategy;

          if (!strategy || !strategy.id || typeof strategy.analyze !== "function") {
            console.log(`  ⚠️ Invalid strategy: ${winner.file}`);
            continue;
          }

          this.modularStrategies.set(strategy.id, {
            strategy,
            symbols: winner.symbols,
            interval: winner.interval,
          });

          // Add symbols to trading list if not already present
          for (const symbol of winner.symbols) {
            if (!this.config.tradingSymbols.includes(symbol)) {
              this.config.tradingSymbols.push(symbol);
            }
          }

          console.log(`  ✅ ${strategy.id}: ${strategy.name} (${winner.symbols.length} symbols @ ${winner.interval}m)`);
        } catch (error: any) {
          console.log(`  ⚠️ Error loading ${winner.file}: ${error.message}`);
        }
      }

      console.log(`\nLoaded ${this.modularStrategies.size} modular strategies`);
    } catch (error: any) {
      console.error("Error loading winners.json:", error.message);
    }
  }

  // Clean up orphaned positions from old strategy-lab.ts system
  cleanupOrphanedPositions(): void {
    const validStrategyIds = new Set<string>();
    for (const [strategyId] of this.modularStrategies) {
      validStrategyIds.add(strategyId);
    }

    const orphanedPositions: string[] = [];
    for (const [symbol, position] of this.positions) {
      if (!validStrategyIds.has(position.strategyId)) {
        orphanedPositions.push(symbol);
      }
    }

    if (orphanedPositions.length > 0) {
      console.log(`\n⚠️ Found ${orphanedPositions.length} orphaned positions (old strategy-lab.ts system):`);
      for (const symbol of orphanedPositions) {
        const position = this.positions.get(symbol)!;
        console.log(`  - ${symbol}: ${position.strategyId} (will close on next exit check)`);
        // Mark for immediate exit by setting a very tight stop loss
        position.stopLoss = position.side === "long"
          ? position.entryPrice * 1.5  // Trigger immediate close
          : position.entryPrice * 0.5;
      }
      console.log("  These positions will be closed at market on next tick.\n");
    }
  }

  // Get account balance (real or simulated)
  async getBalance(): Promise<number> {
    try {
      const balances = await api.getBalances();
      const usdBalance = balances.find((b: any) => b.currency === "USD");
      const realBalance = usdBalance ? parseFloat(usdBalance.available) : 0;

      // If real balance is 0 or low, use simulated balance
      if (realBalance < 10) {
        console.log(`  [Using simulated balance: $${this.config.simulatedBalance}]`);
        return this.config.simulatedBalance + this.dailyPnL;
      }
      return realBalance;
    } catch (error) {
      // Fallback to simulated
      return this.config.simulatedBalance + this.dailyPnL;
    }
  }

  // Calculate position size
  calculatePositionSize(balance: number, price: number): number {
    const positionValue = balance * (this.config.positionSizePercent / 100);
    return positionValue / price;
  }

  // Generate trading signal - ONLY uses modular strategies from winners.json
  async generateSignal(symbol: string): Promise<Signal> {
    // Check modular strategies first (Claude-created winners)
    for (const [strategyId, entry] of this.modularStrategies) {
      if (entry.symbols.includes(symbol)) {
        try {
          await this.rateLimit();
          const candles = await api.fetchHistoricalData(symbol, entry.interval, 100);
          if (candles.length >= 50) {
            const signal = await entry.strategy.analyze(candles);

            if (signal !== "hold") {
              console.log(`  🧠 ${symbol} (${entry.interval}m): ${signal.toUpperCase()} - ${strategyId}`);
              return signal;
            }
          }
        } catch (error: any) {
          console.error(`  Error in ${strategyId} for ${symbol}: ${error.message}`);
        }
      }
    }

    return "hold";
  }

  // Get strategy ID for a symbol (from modular strategies)
  private getStrategyIdForSymbol(symbol: string): string {
    for (const [strategyId, entry] of this.modularStrategies) {
      if (entry.symbols.includes(symbol)) {
        return strategyId;
      }
    }
    return "unknown";
  }

  // Get interval for a symbol (from modular strategies)
  private getIntervalForSymbol(symbol: string): number {
    for (const [, entry] of this.modularStrategies) {
      if (entry.symbols.includes(symbol)) {
        return entry.interval;
      }
    }
    return this.config.interval;
  }

  // Open a new position
  async openPosition(symbol: string, side: "long" | "short", balance: number): Promise<void> {
    try {
      // === RISK MANAGEMENT: Check Cooldown ===
      const strategyId = this.getStrategyIdForSymbol(symbol);
      const cooldownKey = `${symbol}_${strategyId}`;
      const cooldown = this.cooldowns.get(cooldownKey);

      if (cooldown && cooldown.until > 0 && Date.now() < cooldown.until) {
        const remainingMins = Math.ceil((cooldown.until - Date.now()) / 60000);
        console.log(`  🚫 SKIPPING ${symbol}+${strategyId}: On cooldown (${remainingMins}m remaining) - ${cooldown.reason}`);
        return;
      }

      // Rate limit API call
      await this.rateLimit();

      // Get current price
      const orderBook = await api.getOrderBook(symbol, 5);
      if (!orderBook.asks?.length || !orderBook.bids?.length) {
        console.log(`  No order book data for ${symbol}`);
        return;
      }
      const price = side === "long" ? parseFloat(orderBook.asks[0][0]) : parseFloat(orderBook.bids[0][0]);

      // === RISK MANAGEMENT: Price Validation ===
      // Get candle price that generated the signal to check for staleness
      const interval = this.getIntervalForSymbol(symbol);
      try {
        await this.rateLimit();
        const candles = await api.fetchHistoricalData(symbol, interval, 5);
        if (candles.length > 0) {
          const signalPrice = candles[candles.length - 1].close;
          const priceDiff = Math.abs(price - signalPrice) / signalPrice * 100;

          if (priceDiff > 2) {
            console.log(`  ⚠️ SKIPPING ${symbol}: Price slippage too high (${priceDiff.toFixed(2)}%) - Signal: $${signalPrice.toFixed(6)}, Current: $${price.toFixed(6)}`);
            return;
          }
        }
      } catch (e) {
        // Continue if price validation fails - better to trade than miss opportunity
        console.log(`  ⚠️ Price validation skipped for ${symbol}`);
      }

      const quantity = this.calculatePositionSize(balance, price);

      if (quantity <= 0) {
        console.log(`Insufficient balance for ${symbol} position`);
        return;
      }

      // === DYNAMIC SL/TP CALCULATION ===
      // (interval already declared above for price validation)

      // Check ATR cache first
      const cacheKey = `${symbol}_${interval}`;
      const cached = atrCache.get(cacheKey);
      let atr: number;

      if (cached && Date.now() - cached.timestamp < ATR_CACHE_TTL) {
        atr = cached.atr;
      } else {
        // Fetch candles and calculate ATR
        try {
          const candles = await api.fetchHistoricalData(symbol, interval, 50);
          atr = calculateATR(candles, 14);
          atrCache.set(cacheKey, { atr, timestamp: Date.now() });
        } catch (e) {
          // Fallback to static if ATR calculation fails
          atr = price * (this.config.stopLossPercent / 100); // Use static as fallback
          console.log(`  ⚠️ ATR calc failed for ${symbol}, using fallback`);
        }
      }

      // Calculate dynamic SL/TP
      const dynamicRisk = calculateDynamicSLTP(price, atr, strategyId);

      const stopLoss = side === "long"
        ? price * (1 - dynamicRisk.stopLossPercent / 100)
        : price * (1 + dynamicRisk.stopLossPercent / 100);

      const takeProfit = side === "long"
        ? price * (1 + dynamicRisk.takeProfitPercent / 100)
        : price * (1 - dynamicRisk.takeProfitPercent / 100);

      console.log(`  📊 Dynamic Risk: ${dynamicRisk.strategyType} | ATR: ${dynamicRisk.atrPercent.toFixed(2)}% | SL: ${dynamicRisk.stopLossPercent.toFixed(2)}% | TP: ${dynamicRisk.takeProfitPercent.toFixed(2)}%`);

      // Revolut X requires UUID format for client_order_id
      const orderId = crypto.randomUUID();
      const orderSide = side === "long" ? "buy" : "sell";

      console.log(`[LIVE] Opening ${side} position: ${symbol} @ ${price}, qty: ${quantity.toFixed(8)}`);

      // Try to place real order, but continue even if it fails
      try {
        await api.placeOrder(orderId, symbol, orderSide, "market", {
          baseSize: quantity.toFixed(8),
        });
        console.log(`  Order placed successfully!`);
      } catch (orderError: any) {
        console.log(`  Order failed (${orderError.message}) - tracking as simulated`);
        // Continue anyway - we'll track it as if it succeeded
      }

      // Track position with dynamic SL/TP
      const position: Position = {
        symbol,
        side,
        entryPrice: price,
        entryTime: Date.now(),
        quantity,
        strategyId,
        stopLoss,
        takeProfit,
        strategyType: dynamicRisk.strategyType,
        atrAtEntry: atr,
      };

      this.positions.set(symbol, position);
      this.savePositions(); // Save to file
      console.log(`Position opened: ${JSON.stringify(position)}`);
    } catch (error) {
      console.error(`Error opening position for ${symbol}:`, error);
    }
  }

  // Close an existing position
  async closePosition(symbol: string, reason: string): Promise<void> {
    const position = this.positions.get(symbol);
    if (!position) return;

    try {
      // Get current price
      const orderBook = await api.getOrderBook(symbol, 5);
      if (!orderBook.asks?.length || !orderBook.bids?.length) {
        console.log(`  No order book data for ${symbol} - can't close`);
        return;
      }
      const exitPrice = position.side === "long"
        ? parseFloat(orderBook.bids[0][0])
        : parseFloat(orderBook.asks[0][0]);

      const orderId = crypto.randomUUID();
      const orderSide = position.side === "long" ? "sell" : "buy";

      console.log(`[LIVE] Closing ${position.side} position: ${symbol} @ ${exitPrice} (${reason})`);

      // Try to place real order, but continue even if it fails
      try {
        await api.placeOrder(orderId, symbol, orderSide, "market", {
          baseSize: position.quantity.toFixed(8),
        });
        console.log(`  Close order placed successfully!`);
      } catch (orderError: any) {
        console.log(`  Close order failed (${orderError.message}) - tracking as simulated`);
      }

      // Calculate PnL
      const pnlPercent = position.side === "long"
        ? ((exitPrice - position.entryPrice) / position.entryPrice) * 100
        : ((position.entryPrice - exitPrice) / position.entryPrice) * 100;

      const pnl = (pnlPercent / 100) * position.quantity * position.entryPrice;
      this.dailyPnL += pnl;

      console.log(`Position closed: PnL ${pnl >= 0 ? "+" : ""}${pnl.toFixed(2)} USD (${pnlPercent.toFixed(2)}%)`);

      // Save to trade history for Claude analysis
      this.addToTradeHistory(position, exitPrice, pnl, pnlPercent, reason);

      this.positions.delete(symbol);
      this.savePositions(); // Save to file
    } catch (error) {
      console.error(`Error closing position for ${symbol}:`, error);
    }
  }

  // Check stop loss, take profit, and signal-based exits
  async checkExits(): Promise<void> {
    for (const [symbol, position] of this.positions) {
      try {
        // Rate limit before API call
        await this.rateLimit();
        const orderBook = await api.getOrderBook(symbol, 1);
        const currentPrice = position.side === "long"
          ? parseFloat(orderBook.bids[0][0])
          : parseFloat(orderBook.asks[0][0]);

        // Check stop loss
        if (position.side === "long" && currentPrice <= position.stopLoss!) {
          await this.closePosition(symbol, "stop_loss");
          continue;
        } else if (position.side === "short" && currentPrice >= position.stopLoss!) {
          await this.closePosition(symbol, "stop_loss");
          continue;
        }

        // Check take profit
        if (position.side === "long" && currentPrice >= position.takeProfit!) {
          await this.closePosition(symbol, "take_profit");
          continue;
        } else if (position.side === "short" && currentPrice <= position.takeProfit!) {
          await this.closePosition(symbol, "take_profit");
          continue;
        }

        // Check for signal-based exit (opposite signal = exit)
        const signal = await this.generateSignal(symbol);
        if (signal !== "hold") {
          const shouldExit =
            (position.side === "long" && signal === "sell") ||
            (position.side === "short" && signal === "buy");

          if (shouldExit) {
            console.log(`  🔄 ${symbol} SIGNAL EXIT: ${position.side.toUpperCase()} -> ${signal.toUpperCase()}`);
            await this.closePosition(symbol, "signal_reversal");
          }
        }

        // Rate limiting handled by rateLimit() helper
      } catch (error) {
        console.error(`Error checking exits for ${symbol}:`, error);
      }
    }
  }

  // Check for new entry signals
  async checkEntries(): Promise<void> {
    // Check daily loss limit
    if (this.startingBalance > 0) {
      const dailyLossPercent = (this.dailyPnL / this.startingBalance) * 100;
      if (dailyLossPercent < -this.config.maxDailyLossPercent) {
        console.log(`Daily loss limit reached (${dailyLossPercent.toFixed(2)}%). Pausing entries.`);
        return;
      }
    }

    // Check max positions
    if (this.positions.size >= this.config.maxPositions) {
      return;
    }

    const balance = await this.getBalance();
    if (this.startingBalance === 0) {
      this.startingBalance = balance;
    }

    for (const symbol of this.config.tradingSymbols) {
      // Skip if already have position
      if (this.positions.has(symbol)) continue;

      // Skip if max positions reached
      if (this.positions.size >= this.config.maxPositions) break;

      const signal = await this.generateSignal(symbol);

      if (signal === "buy") {
        await this.openPosition(symbol, "long", balance);
      } else if (signal === "sell") {
        await this.openPosition(symbol, "short", balance);
      }

      // Rate limit - Conservative 2s between requests
      await this.rateLimit();
    }
  }

  // Load existing positions and orders from Revolut X
  async loadExistingState(): Promise<void> {
    console.log("\n--- Checking Revolut X Account State ---");

    try {
      // Get all balances (crypto holdings)
      const balances = await api.getBalances();
      const holdings = balances.filter((b: any) => parseFloat(b.available) > 0);

      if (holdings.length > 0) {
        console.log("Current holdings:");
        let totalUsdValue = 0;

        for (const h of holdings) {
          const amount = parseFloat(h.available);
          let usdValue = 0;

          // Try to get USD price
          if (h.currency === "USD" || h.currency === "USDT" || h.currency === "USDC") {
            usdValue = amount;
          } else {
            try {
              const orderBook = await api.getOrderBook(`${h.currency}-USD`, 1);
              const price = parseFloat(orderBook.bids[0][0]);
              usdValue = amount * price;
            } catch {
              // Try USDT pair if USD not available
              try {
                const orderBook = await api.getOrderBook(`${h.currency}-USDT`, 1);
                const price = parseFloat(orderBook.bids[0][0]);
                usdValue = amount * price;
              } catch {
                usdValue = 0; // Can't determine price
              }
            }
          }

          totalUsdValue += usdValue;
          console.log(`  ${h.currency}: ${amount.toFixed(8)} = $${usdValue.toFixed(2)}`);
        }

        console.log(`  --------------------------------`);
        console.log(`  TOTAL PORTFOLIO: $${totalUsdValue.toFixed(2)}`);
      } else {
        console.log("No crypto holdings");
      }

      // Get active orders
      const activeOrders = await api.getActiveOrders();
      if (activeOrders.length > 0) {
        console.log(`\nActive orders: ${activeOrders.length}`);
        for (const o of activeOrders.slice(0, 5)) {
          console.log(`  ${o.symbol} ${o.side} ${o.type} @ ${o.price || 'market'}`);
        }
      } else {
        console.log("No active orders");
      }
    } catch (error: any) {
      console.log(`Could not fetch account state: ${error.message}`);
    }
  }

  // Track if iterator was invoked this session
  private iteratorInvokedAt: number = 0;
  private readonly ITERATOR_COOLDOWN_MS = 60 * 60 * 1000; // 1 hour cooldown
  private readonly LOSS_THRESHOLD_PERCENT = 13.5;

  // Invoke iterator to analyze and fix strategies
  private async invokeIterator(): Promise<void> {
    console.log("\n" + "!".repeat(60));
    console.log("⚠️  LOSS THRESHOLD EXCEEDED - INVOKING CLAUDE ITERATOR");
    console.log("!".repeat(60));

    try {
      const { spawn } = await import("child_process");
      const iteratorPath = path.join(process.cwd(), "src", "iterator.ts");

      console.log("Spawning iterator to analyze and fix strategies...");

      // Quote the path for Windows compatibility (spaces in path)
      const iterator = spawn("npx", ["tsx", `"${iteratorPath}"`, "1"], {
        cwd: process.cwd(),
        stdio: "inherit",
        shell: true,
      });

      iterator.on("close", async (code) => {
        console.log(`Iterator exited with code ${code}`);
        if (code === 0) {
          console.log("Iterator completed - reloading strategies...");
          // Reload strategies after iterator finishes
          await this.loadModularStrategies();
          console.log("Strategies reloaded!");
        }
      });

      this.iteratorInvokedAt = Date.now();
    } catch (error: any) {
      console.error("Failed to invoke iterator:", error.message);
    }
  }

  // Main execution loop
  async run(): Promise<void> {
    this.isRunning = true;
    console.log("\n" + "=".repeat(60));
    console.log("QUANT AGENT EXECUTOR - LIVE TRADING");
    console.log("=".repeat(60));

    await this.loadModularStrategies();  // Load Claude-created winning strategies from winners.json
    await this.loadExistingState();
    this.cleanupOrphanedPositions();     // Close old positions from strategy-lab.ts system

    const balance = await this.getBalance();
    this.startingBalance = balance;
    console.log(`\nStarting balance: $${balance.toFixed(2)}`);
    console.log(`Position size: ${this.config.positionSizePercent}%`);
    console.log(`Max positions: ${this.config.maxPositions}`);
    console.log(`Risk management: DYNAMIC ATR-based SL/TP (strategy-adaptive)`);
    console.log(`  - Scalping: SL 0.5-2%, TP 0.8-3% (1.0x/1.5x ATR)`);
    console.log(`  - Trend: SL 2-8%, TP 4-20% (2.0x/4.0x ATR)`);
    console.log(`  - Mean Rev: SL 1-4%, TP 1.5-6% (1.5x/2.0x ATR)`);
    console.log(`  - Momentum: SL 1.5-5%, TP 3-12% (1.5x/3.0x ATR)`);
    console.log(`  - Breakout: SL 1-4%, TP 3-15% (1.2x/3.5x ATR)`);
    console.log(`  - Default: SL 2-5%, TP 4-10% (1.5x/3.0x ATR)`);
    console.log(`Trading symbols: ${this.config.tradingSymbols.join(", ")}`);
    console.log(`Loss threshold for iterator: ${this.LOSS_THRESHOLD_PERCENT}%`);
    console.log("\nStarting execution loop...\n");

    while (this.isRunning) {
      try {
        const now = new Date();
        console.log(`\n[${now.toISOString()}] Tick`);

        // Check exits first
        await this.checkExits();

        // Then check for new entries
        await this.checkEntries();

        // Status update
        const dailyLossPercent = this.startingBalance > 0
          ? (this.dailyPnL / this.startingBalance) * 100
          : 0;
        console.log(`  Positions: ${this.positions.size}/${this.config.maxPositions}`);
        console.log(`  Daily PnL: ${this.dailyPnL >= 0 ? "+" : ""}$${this.dailyPnL.toFixed(2)} (${dailyLossPercent >= 0 ? "+" : ""}${dailyLossPercent.toFixed(2)}%)`);

        // Check if loss exceeds threshold - invoke iterator
        if (dailyLossPercent < -this.LOSS_THRESHOLD_PERCENT) {
          const timeSinceLastInvoke = Date.now() - this.iteratorInvokedAt;
          if (timeSinceLastInvoke > this.ITERATOR_COOLDOWN_MS) {
            console.log(`  ⚠️  Daily loss ${dailyLossPercent.toFixed(2)}% exceeds -${this.LOSS_THRESHOLD_PERCENT}% threshold!`);
            await this.invokeIterator();
          } else {
            const cooldownRemaining = Math.ceil((this.ITERATOR_COOLDOWN_MS - timeSinceLastInvoke) / 60000);
            console.log(`  ⚠️  Loss threshold exceeded but iterator on cooldown (${cooldownRemaining}m remaining)`);
          }
        }

        // Wait for next candle
        const waitMs = this.config.interval * 60 * 1000;
        await new Promise(resolve => setTimeout(resolve, waitMs));
      } catch (error) {
        console.error("Execution error:", error);
        await new Promise(resolve => setTimeout(resolve, 10000));
      }
    }
  }

  // Stop execution
  stop(): void {
    this.isRunning = false;
    console.log("\nExecutor stopped");
  }

  // Get current status
  getStatus(): object {
    return {
      isRunning: this.isRunning,
      positions: Array.from(this.positions.values()),
      dailyPnL: this.dailyPnL,
      startingBalance: this.startingBalance,
      activeStrategies: Array.from(this.modularStrategies.keys()),
    };
  }
}

// CLI entry point
const isMainExecutor = process.argv[1]?.includes("executor");
if (isMainExecutor) {
  const executor = new Executor();

  // Handle graceful shutdown
  process.on("SIGINT", () => {
    console.log("\nShutting down...");
    executor.stop();
    process.exit(0);
  });

  executor.run().catch(console.error);
}
