// Backtester Engine V2 - Simulates trading strategies with proper exit management
import { fetchHistoricalData, type Candle } from "./utils/revolut-api.js";
import {
  executeStrategy,
  generateAllStrategies,
  type StrategyConfig,
  type Signal,
} from "./strategy-lab.js";

export interface Trade {
  entryTime: number;
  exitTime: number;
  entryPrice: number;
  exitPrice: number;
  side: "long" | "short";
  pnl: number;
  pnlPercent: number;
  fees: number;
  exitReason: "signal" | "take_profit" | "stop_loss" | "trailing_stop" | "end_of_data";
}

export interface BacktestResult {
  strategyId: string;
  strategyName: string;
  symbol: string;
  interval: number;
  trades: Trade[];
  metrics: PerformanceMetrics;
  config: StrategyConfig;
}

export interface PerformanceMetrics {
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  winRate: number;
  totalPnL: number;
  totalPnLPercent: number;
  avgWin: number;
  avgLoss: number;
  profitFactor: number;
  maxDrawdown: number;
  maxDrawdownPercent: number;
  sharpeRatio: number;
  sortinoRatio: number;
  avgHoldingPeriod: number;
  consecutiveWins: number;
  consecutiveLosses: number;
}

// Trading configuration - ULTRA AGGRESSIVE for 2-5% daily returns
const TRADING_CONFIG = {
  initialCapital: 10000,
  positionSize: 0.50, // 50% per trade (VERY aggressive - target 2%+ daily)
  slippage: 0.0005, // 0.05% slippage (reduced for better execution)
  makerFee: 0.001, // 0.1% maker fee
  takerFee: 0.002, // 0.2% taker fee (market orders)
  // Let winners run - no fixed take profit, rely on trailing stop
  defaultTakeProfit: 10.0, // 10% take profit (high - let winners run)
  defaultStopLoss: 1.5, // 1.5% stop loss (slightly wider for noise)
  defaultTrailingStop: 2.0, // 2% trailing stop (captures trending moves)
};

interface Position {
  side: "long" | "short";
  entryPrice: number;
  entryTime: number;
  highWaterMark: number; // For trailing stop
  barsHeld: number;
}

// Calculate performance metrics from trades
function calculateMetrics(trades: Trade[], initialCapital: number): PerformanceMetrics {
  if (trades.length === 0) {
    return {
      totalTrades: 0,
      winningTrades: 0,
      losingTrades: 0,
      winRate: 0,
      totalPnL: 0,
      totalPnLPercent: 0,
      avgWin: 0,
      avgLoss: 0,
      profitFactor: 0,
      maxDrawdown: 0,
      maxDrawdownPercent: 0,
      sharpeRatio: 0,
      sortinoRatio: 0,
      avgHoldingPeriod: 0,
      consecutiveWins: 0,
      consecutiveLosses: 0,
    };
  }

  const winningTrades = trades.filter((t) => t.pnl > 0);
  const losingTrades = trades.filter((t) => t.pnl <= 0);
  const totalPnL = trades.reduce((sum, t) => sum + t.pnl, 0);
  const totalFees = trades.reduce((sum, t) => sum + t.fees, 0);

  const grossProfit = winningTrades.reduce((sum, t) => sum + t.pnl, 0);
  const grossLoss = Math.abs(losingTrades.reduce((sum, t) => sum + t.pnl, 0));

  // Calculate max drawdown
  let peak = initialCapital;
  let maxDrawdown = 0;
  let runningCapital = initialCapital;

  for (const trade of trades) {
    runningCapital += trade.pnl - trade.fees;
    if (runningCapital > peak) peak = runningCapital;
    const drawdown = peak - runningCapital;
    if (drawdown > maxDrawdown) maxDrawdown = drawdown;
  }

  // Calculate returns for Sharpe/Sortino
  const returns = trades.map((t) => t.pnlPercent);
  const avgReturn = returns.reduce((a, b) => a + b, 0) / returns.length;
  const stdDev = Math.sqrt(
    returns.reduce((sum, r) => sum + Math.pow(r - avgReturn, 2), 0) / returns.length
  );
  const downsideReturns = returns.filter((r) => r < 0);
  const downsideDev =
    downsideReturns.length > 0
      ? Math.sqrt(
          downsideReturns.reduce((sum, r) => sum + Math.pow(r, 2), 0) / downsideReturns.length
        )
      : 0;

  // Calculate consecutive wins/losses
  let maxConsecutiveWins = 0;
  let maxConsecutiveLosses = 0;
  let currentWins = 0;
  let currentLosses = 0;

  for (const trade of trades) {
    if (trade.pnl > 0) {
      currentWins++;
      currentLosses = 0;
      if (currentWins > maxConsecutiveWins) maxConsecutiveWins = currentWins;
    } else {
      currentLosses++;
      currentWins = 0;
      if (currentLosses > maxConsecutiveLosses) maxConsecutiveLosses = currentLosses;
    }
  }

  const avgHoldingPeriod =
    trades.reduce((sum, t) => sum + (t.exitTime - t.entryTime), 0) / trades.length / 60000; // minutes

  return {
    totalTrades: trades.length,
    winningTrades: winningTrades.length,
    losingTrades: losingTrades.length,
    winRate: (winningTrades.length / trades.length) * 100,
    totalPnL: totalPnL - totalFees,
    totalPnLPercent: ((totalPnL - totalFees) / initialCapital) * 100,
    avgWin: winningTrades.length > 0 ? grossProfit / winningTrades.length : 0,
    avgLoss: losingTrades.length > 0 ? grossLoss / losingTrades.length : 0,
    profitFactor: grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? Infinity : 0,
    maxDrawdown,
    maxDrawdownPercent: peak > 0 ? (maxDrawdown / peak) * 100 : 0,
    sharpeRatio: stdDev > 0 ? (avgReturn / stdDev) * Math.sqrt(252) : 0, // Annualized
    sortinoRatio: downsideDev > 0 ? (avgReturn / downsideDev) * Math.sqrt(252) : 0,
    avgHoldingPeriod,
    consecutiveWins: maxConsecutiveWins,
    consecutiveLosses: maxConsecutiveLosses,
  };
}

// Close position helper
function closePosition(
  position: Position,
  exitPrice: number,
  exitTime: number,
  exitReason: Trade["exitReason"],
  positionValue: number
): Trade {
  const adjustedExitPrice =
    position.side === "long"
      ? exitPrice * (1 - TRADING_CONFIG.slippage)
      : exitPrice * (1 + TRADING_CONFIG.slippage);

  const pnlPercent =
    position.side === "long"
      ? ((adjustedExitPrice - position.entryPrice) / position.entryPrice) * 100
      : ((position.entryPrice - adjustedExitPrice) / position.entryPrice) * 100;

  const pnl = (pnlPercent / 100) * positionValue;
  const fees = positionValue * (TRADING_CONFIG.makerFee + TRADING_CONFIG.takerFee);

  return {
    entryTime: position.entryTime,
    exitTime,
    entryPrice: position.entryPrice,
    exitPrice: adjustedExitPrice,
    side: position.side,
    pnl,
    pnlPercent,
    fees,
    exitReason,
  };
}

// Run backtest for a single strategy with improved exit management
export function backtestStrategy(
  config: StrategyConfig,
  candles: Candle[],
  symbol: string,
  interval: number
): BacktestResult {
  const result = executeStrategy(config, candles);
  const trades: Trade[] = [];

  let position: Position | null = null;
  const capital = TRADING_CONFIG.initialCapital;
  const positionValue = capital * TRADING_CONFIG.positionSize;

  // Get exit parameters from config or use defaults
  const takeProfitPct = TRADING_CONFIG.defaultTakeProfit;
  const stopLossPct = TRADING_CONFIG.defaultStopLoss;
  const trailingStopPct = TRADING_CONFIG.defaultTrailingStop;

  for (let i = 1; i < candles.length; i++) {
    const signal = result.signals[i];
    const candle = candles[i];
    const price = candle.close;
    const high = candle.high;
    const low = candle.low;
    const time = candle.start;

    // If in position, check exits first
    if (position) {
      position.barsHeld++;

      // Update high water mark for trailing stop
      if (position.side === "long") {
        if (high > position.highWaterMark) {
          position.highWaterMark = high;
        }
      } else {
        if (low < position.highWaterMark) {
          position.highWaterMark = low;
        }
      }

      // Calculate current P&L
      const currentPnlPercent =
        position.side === "long"
          ? ((price - position.entryPrice) / position.entryPrice) * 100
          : ((position.entryPrice - price) / position.entryPrice) * 100;

      // Check take profit
      const takeProfitPrice =
        position.side === "long"
          ? position.entryPrice * (1 + takeProfitPct / 100)
          : position.entryPrice * (1 - takeProfitPct / 100);

      if (
        (position.side === "long" && high >= takeProfitPrice) ||
        (position.side === "short" && low <= takeProfitPrice)
      ) {
        trades.push(closePosition(position, takeProfitPrice, time, "take_profit", positionValue));
        position = null;
        continue;
      }

      // Check stop loss
      const stopLossPrice =
        position.side === "long"
          ? position.entryPrice * (1 - stopLossPct / 100)
          : position.entryPrice * (1 + stopLossPct / 100);

      if (
        (position.side === "long" && low <= stopLossPrice) ||
        (position.side === "short" && high >= stopLossPrice)
      ) {
        trades.push(closePosition(position, stopLossPrice, time, "stop_loss", positionValue));
        position = null;
        continue;
      }

      // Check trailing stop (only if in profit)
      if (currentPnlPercent > 0) {
        const trailingStopPrice =
          position.side === "long"
            ? position.highWaterMark * (1 - trailingStopPct / 100)
            : position.highWaterMark * (1 + trailingStopPct / 100);

        if (
          (position.side === "long" && low <= trailingStopPrice) ||
          (position.side === "short" && high >= trailingStopPrice)
        ) {
          trades.push(closePosition(position, trailingStopPrice, time, "trailing_stop", positionValue));
          position = null;
          continue;
        }
      }

      // Check for opposite signal exit
      if (
        (position.side === "long" && signal === "sell") ||
        (position.side === "short" && signal === "buy")
      ) {
        trades.push(closePosition(position, price, time, "signal", positionValue));
        position = null;
        // Continue to potentially open a new position with this signal
      }
    }

    // Entry logic - only enter if not in position
    if (!position) {
      if (signal === "buy") {
        const entryPrice = price * (1 + TRADING_CONFIG.slippage);
        position = {
          side: "long",
          entryPrice,
          entryTime: time,
          highWaterMark: high,
          barsHeld: 0,
        };
      } else if (signal === "sell") {
        const entryPrice = price * (1 - TRADING_CONFIG.slippage);
        position = {
          side: "short",
          entryPrice,
          entryTime: time,
          highWaterMark: low,
          barsHeld: 0,
        };
      }
    }
  }

  // Close any open position at the end
  if (position) {
    const lastCandle = candles[candles.length - 1];
    trades.push(
      closePosition(position, lastCandle.close, lastCandle.start, "end_of_data", positionValue)
    );
  }

  const metrics = calculateMetrics(trades, capital);

  return {
    strategyId: config.id,
    strategyName: config.name,
    symbol,
    interval,
    trades,
    metrics,
    config,
  };
}

// Run backtest for multiple strategies on multiple symbols
export async function runBacktestSuite(
  symbols: string[],
  intervals: number[],
  limit = 500
): Promise<BacktestResult[]> {
  const allStrategies = generateAllStrategies();
  const results: BacktestResult[] = [];

  console.log(`\n=== Running Backtest Suite V2 ===`);
  console.log(`Strategies: ${allStrategies.length}`);
  console.log(`Symbols: ${symbols.join(", ")}`);
  console.log(`Intervals: ${intervals.join(", ")} minutes`);
  console.log(`Total combinations: ${allStrategies.length * symbols.length * intervals.length}\n`);

  for (const symbol of symbols) {
    for (const interval of intervals) {
      console.log(`\nFetching ${symbol} @ ${interval}m...`);

      let candles: Candle[];
      try {
        candles = await fetchHistoricalData(symbol, interval, limit);
        console.log(`  Got ${candles.length} candles`);
      } catch (error) {
        console.log(`  Error fetching data: ${error}`);
        continue;
      }

      if (candles.length < 100) {
        console.log(`  Insufficient data (need 100+ candles)`);
        continue;
      }

      for (const strategy of allStrategies) {
        const result = backtestStrategy(strategy, candles, symbol, interval);
        results.push(result);
      }

      console.log(`  Tested ${allStrategies.length} strategies`);
    }
  }

  return results;
}

// Rank results by a composite score
export function rankResults(results: BacktestResult[]): BacktestResult[] {
  // Filter out strategies with insufficient trades or zero win rate
  const validResults = results.filter(
    (r) => r.metrics.totalTrades >= 5 && r.metrics.winRate > 0 && r.metrics.profitFactor > 0
  );

  // Calculate composite score prioritizing:
  // 1. Positive Sharpe ratio
  // 2. Good profit factor
  // 3. Acceptable win rate
  // 4. Low max drawdown
  const scored = validResults.map((r) => {
    // Sharpe must be positive
    const sharpeScore = r.metrics.sharpeRatio > 0 ? r.metrics.sharpeRatio : 0;
    
    // Profit factor bonus (capped at 3 to avoid overfitting)
    const pfScore = Math.min(r.metrics.profitFactor, 3);
    
    // Win rate factor (0.5 to 1.0 range)
    const winRateFactor = 0.5 + (Math.min(r.metrics.winRate, 70) / 140);
    
    // Drawdown penalty (lower is better)
    const ddPenalty = r.metrics.maxDrawdownPercent > 0 
      ? 1 / (1 + r.metrics.maxDrawdownPercent / 10) 
      : 1;
    
    // Trade count factor (more trades = more reliable, but diminishing returns)
    const tradeFactor = Math.sqrt(r.metrics.totalTrades) / 5;
    
    // Total return factor
    const returnFactor = r.metrics.totalPnLPercent > 0 
      ? Math.log10(1 + r.metrics.totalPnLPercent) 
      : 0;

    return {
      ...r,
      score: sharpeScore * pfScore * winRateFactor * ddPenalty * tradeFactor * (1 + returnFactor),
    };
  });

  // Sort by score descending
  scored.sort((a, b) => b.score - a.score);

  return scored;
}

// Print results in a formatted table
export function printResults(results: BacktestResult[], top = 20): void {
  console.log("\n" + "=".repeat(140));
  console.log("TOP PERFORMING STRATEGIES (V2 - WITH EXIT MANAGEMENT)");
  console.log("=".repeat(140));

  const ranked = rankResults(results).slice(0, top);

  if (ranked.length === 0) {
    console.log("\nNo strategies met the criteria (5+ trades, >0% win rate, >0 profit factor)");
    
    // Show best of the rest
    const allSorted = results
      .filter(r => r.metrics.totalTrades > 0)
      .sort((a, b) => b.metrics.totalPnLPercent - a.metrics.totalPnLPercent)
      .slice(0, 10);
    
    if (allSorted.length > 0) {
      console.log("\nShowing top 10 by PnL (may not meet quality criteria):");
      allSorted.forEach((r, i) => {
        console.log(
          `${i + 1}. ${r.strategyId} - ${r.symbol} @ ${r.interval}m: ` +
          `${r.metrics.totalTrades} trades, ${r.metrics.winRate.toFixed(1)}% win, ` +
          `${r.metrics.totalPnLPercent.toFixed(2)}% PnL`
        );
      });
    }
    return;
  }

  console.log(
    "\n" +
      [
        "Rank".padEnd(5),
        "Strategy".padEnd(30),
        "Symbol".padEnd(10),
        "Int".padEnd(5),
        "Trades".padEnd(7),
        "Win%".padEnd(7),
        "PnL%".padEnd(9),
        "PF".padEnd(6),
        "Sharpe".padEnd(8),
        "MaxDD%".padEnd(8),
        "AvgWin".padEnd(8),
        "AvgLoss".padEnd(8),
      ].join("")
  );
  console.log("-".repeat(140));

  ranked.forEach((r, i) => {
    console.log(
      [
        `#${i + 1}`.padEnd(5),
        r.strategyId.slice(0, 28).padEnd(30),
        r.symbol.padEnd(10),
        `${r.interval}m`.padEnd(5),
        r.metrics.totalTrades.toString().padEnd(7),
        `${r.metrics.winRate.toFixed(1)}%`.padEnd(7),
        `${r.metrics.totalPnLPercent >= 0 ? "+" : ""}${r.metrics.totalPnLPercent.toFixed(2)}%`.padEnd(9),
        r.metrics.profitFactor.toFixed(2).padEnd(6),
        r.metrics.sharpeRatio.toFixed(2).padEnd(8),
        `${r.metrics.maxDrawdownPercent.toFixed(1)}%`.padEnd(8),
        `$${r.metrics.avgWin.toFixed(0)}`.padEnd(8),
        `$${r.metrics.avgLoss.toFixed(0)}`.padEnd(8),
      ].join("")
    );
  });

  console.log("\n" + "=".repeat(140));
  
  // Print exit reason breakdown for top strategy
  if (ranked.length > 0) {
    const topStrategy = ranked[0];
    const exitReasons = topStrategy.trades.reduce((acc, t) => {
      acc[t.exitReason] = (acc[t.exitReason] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    
    console.log(`\nTop Strategy Exit Breakdown (${topStrategy.strategyId}):`);
    Object.entries(exitReasons).forEach(([reason, count]) => {
      console.log(`  ${reason}: ${count} (${((count / topStrategy.trades.length) * 100).toFixed(1)}%)`);
    });
  }
}

// Save results to JSON file - streams to handle large datasets
export async function saveResults(results: BacktestResult[], filename: string): Promise<void> {
  const fs = await import("fs");
  const path = await import("path");

  const outputDir = path.join(process.cwd(), "results");
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  // Sort by PnL descending first
  const sortedResults = [...results].sort((a, b) =>
    b.metrics.totalPnLPercent - a.metrics.totalPnLPercent
  );

  console.log(`\nSaving ${sortedResults.length} results (sorted by PnL)`);

  const filepath = path.join(outputDir, filename);

  // Stream write to handle large arrays - write JSON array manually
  const stream = fs.createWriteStream(filepath);
  stream.write("[\n");

  for (let i = 0; i < sortedResults.length; i++) {
    const json = JSON.stringify(sortedResults[i]);
    stream.write(json);
    if (i < sortedResults.length - 1) {
      stream.write(",\n");
    }
  }

  stream.write("\n]");
  stream.end();

  await new Promise<void>((resolve, reject) => {
    stream.on("finish", resolve);
    stream.on("error", reject);
  });

  console.log(`Results saved to: ${filepath}`);
}

// Main backtest runner
export async function runBacktest(): Promise<BacktestResult[]> {
  console.log("=== QUANT AGENT BACKTESTER V2 ===\n");
  console.log("Features: Take Profit, Stop Loss, Trailing Stop\n");

  // Fetch ALL active USD symbols from Revolut X dynamically
  const { getAllSymbols } = await import("./utils/revolut-api.js");
  let symbols: string[];

  try {
    console.log("Fetching all available symbols from Revolut X...");
    symbols = await getAllSymbols();
    console.log(`Found ${symbols.length} active USD trading pairs!\n`);
  } catch (error) {
    console.error("Failed to fetch symbols, using fallback list:", error);
    // Fallback to major pairs if API fails
    symbols = [
      "BTC-USD", "ETH-USD", "SOL-USD", "XRP-USD", "DOGE-USD",
      "ADA-USD", "DOT-USD", "LINK-USD", "AVAX-USD", "LTC-USD",
      "BNB-USD", "MATIC-USD", "SHIB-USD", "TRX-USD", "ATOM-USD",
      "UNI-USD", "FIL-USD", "HBAR-USD", "APT-USD", "ARB-USD",
      "OP-USD", "SUI-USD", "INJ-USD", "NEAR-USD", "PEPE-USD",
    ];
  }

  // Multiple timeframes - focus on 15m and 4h for best balance of signal quality and trade frequency
  // Also include 1h for medium-term trades
  const intervals = [15, 60, 240]; // 15m, 1h, 4h (removed 5m - too noisy)

  const results = await runBacktestSuite(symbols, intervals, 500);

  printResults(results, 30);

  const timestamp = new Date().toISOString().split("T")[0];
  await saveResults(results, `backtest_${timestamp}.json`);

  // Return top strategies for the iterator
  return rankResults(results).slice(0, 50);
}

// CLI entry point
const isMain = process.argv[1]?.includes("backtester");
if (isMain) {
  runBacktest().catch(console.error);
}
