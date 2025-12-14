#!/usr/bin/env npx tsx
// Quick Backtest - Fast single strategy tester
// Usage: npx tsx src/quick-backtest.ts <strategy-file> <symbol> <interval>
// Example: npx tsx src/quick-backtest.ts momentum/trend-following.ts BTC-USD 60

import * as api from "./utils/revolut-api.js";
import { join, dirname } from "path";
import { fileURLToPath, pathToFileURL } from "url";
import type { Strategy, Signal } from "./strategies/index.js";
import type { Candle } from "./indicators/index.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

interface QuickBacktestResult {
  strategyId: string;
  symbol: string;
  interval: number;
  totalTrades: number;
  winRate: number;
  totalPnLPercent: number;
  avgTradePercent: number;
  sharpeRatio: number;
  maxDrawdownPercent: number;
  profitFactor: number;
  duration: number; // milliseconds
}

// Simple backtest engine
async function runBacktest(
  strategy: Strategy,
  candles: Candle[],
  symbol: string,
  interval: number
): Promise<QuickBacktestResult> {
  const startTime = Date.now();
  const trades: { pnlPercent: number }[] = [];
  let position: { side: "long" | "short"; entryPrice: number } | null = null;
  let equity = 100;
  let peak = 100;
  let maxDrawdown = 0;

  // Initialize strategy if needed
  if (strategy.initialize) {
    await strategy.initialize(candles);
  }

  // Run through candles
  for (let i = 50; i < candles.length; i++) {
    const slice = candles.slice(0, i + 1);
    const signal = await strategy.analyze(slice);
    const price = candles[i].close;

    // Exit existing position on opposite signal
    if (position) {
      const shouldExit =
        (position.side === "long" && signal === "sell") ||
        (position.side === "short" && signal === "buy");

      if (shouldExit) {
        const pnlPercent = position.side === "long"
          ? ((price - position.entryPrice) / position.entryPrice) * 100
          : ((position.entryPrice - price) / position.entryPrice) * 100;

        trades.push({ pnlPercent });
        equity *= (1 + pnlPercent / 100);

        // Track drawdown
        if (equity > peak) peak = equity;
        const drawdown = ((peak - equity) / peak) * 100;
        if (drawdown > maxDrawdown) maxDrawdown = drawdown;

        position = null;
      }
    }

    // Enter new position
    if (!position && signal !== "hold") {
      position = {
        side: signal === "buy" ? "long" : "short",
        entryPrice: price,
      };
    }
  }

  // Close any open position at the end
  if (position) {
    const lastPrice = candles[candles.length - 1].close;
    const pnlPercent = position.side === "long"
      ? ((lastPrice - position.entryPrice) / position.entryPrice) * 100
      : ((position.entryPrice - lastPrice) / position.entryPrice) * 100;
    trades.push({ pnlPercent });
  }

  // Calculate metrics
  const wins = trades.filter(t => t.pnlPercent > 0).length;
  const totalPnL = trades.reduce((sum, t) => sum + t.pnlPercent, 0);
  const avgTrade = trades.length > 0 ? totalPnL / trades.length : 0;

  // Sharpe ratio (simplified)
  const returns = trades.map(t => t.pnlPercent);
  const avgReturn = returns.length > 0 ? returns.reduce((a, b) => a + b, 0) / returns.length : 0;
  const stdDev = returns.length > 1
    ? Math.sqrt(returns.reduce((sum, r) => sum + Math.pow(r - avgReturn, 2), 0) / returns.length)
    : 1;
  const sharpe = stdDev > 0 ? avgReturn / stdDev : 0;

  // Profit factor
  const grossProfit = trades.filter(t => t.pnlPercent > 0).reduce((s, t) => s + t.pnlPercent, 0);
  const grossLoss = Math.abs(trades.filter(t => t.pnlPercent < 0).reduce((s, t) => s + t.pnlPercent, 0));
  const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? Infinity : 0;

  return {
    strategyId: strategy.id,
    symbol,
    interval,
    totalTrades: trades.length,
    winRate: trades.length > 0 ? (wins / trades.length) * 100 : 0,
    totalPnLPercent: totalPnL,
    avgTradePercent: avgTrade,
    sharpeRatio: sharpe,
    maxDrawdownPercent: maxDrawdown,
    profitFactor,
    duration: Date.now() - startTime,
  };
}

// Main CLI
async function main() {
  const args = process.argv.slice(2);

  if (args.length < 3) {
    console.log(`
Quick Backtest - Fast single strategy tester

Usage: npx tsx src/quick-backtest.ts <strategy-file> <symbol> <interval>

Arguments:
  strategy-file  Path to strategy file (e.g., momentum/trend-following.ts)
  symbol         Trading pair (e.g., BTC-USD)
  interval       Candle interval in minutes (e.g., 15, 60, 240)

Example:
  npx tsx src/quick-backtest.ts momentum/trend-following.ts BTC-USD 60
    `);
    process.exit(1);
  }

  const [strategyPath, symbol, intervalStr] = args;
  const interval = parseInt(intervalStr, 10);

  console.log("\n=== Quick Backtest ===\n");
  console.log(`Strategy: ${strategyPath}`);
  console.log(`Symbol: ${symbol}`);
  console.log(`Interval: ${interval}m\n`);

  // Load strategy
  const fullPath = join(__dirname, "strategies", strategyPath);
  console.log(`Loading: ${fullPath}`);

  let strategy: Strategy;
  try {
    // Convert Windows path to file URL for ESM import
    const fileUrl = pathToFileURL(fullPath).href;
    const module = await import(fileUrl);
    strategy = module.default;

    if (!strategy || !strategy.id || typeof strategy.analyze !== "function") {
      console.error("Invalid strategy file - must export default with id and analyze()");
      process.exit(1);
    }
  } catch (error: any) {
    console.error(`Failed to load strategy: ${error.message}`);
    process.exit(1);
  }

  console.log(`Loaded: ${strategy.name} (${strategy.id})\n`);

  // Fetch candles
  console.log(`Fetching ${symbol} candles...`);
  const candles = await api.fetchHistoricalData(symbol, interval, 500);
  console.log(`Got ${candles.length} candles\n`);

  if (candles.length < 100) {
    console.error("Insufficient data (need at least 100 candles)");
    process.exit(1);
  }

  // Run backtest
  console.log("Running backtest...");
  const result = await runBacktest(strategy, candles, symbol, interval);

  // Display results
  console.log("\n=== Results ===\n");
  console.log(`Strategy:     ${result.strategyId}`);
  console.log(`Symbol:       ${result.symbol} @ ${result.interval}m`);
  console.log(`Total Trades: ${result.totalTrades}`);
  console.log(`Win Rate:     ${result.winRate.toFixed(1)}%`);
  console.log(`Total PnL:    ${result.totalPnLPercent.toFixed(2)}%`);
  console.log(`Avg Trade:    ${result.avgTradePercent.toFixed(2)}%`);
  console.log(`Sharpe:       ${result.sharpeRatio.toFixed(2)}`);
  console.log(`Max DD:       ${result.maxDrawdownPercent.toFixed(1)}%`);
  console.log(`Profit Factor: ${result.profitFactor.toFixed(2)}`);
  console.log(`Duration:     ${result.duration}ms\n`);

  // Pass/Fail criteria
  const passed = result.totalTrades >= 5 &&
    result.winRate >= 45 &&
    result.totalPnLPercent > 0 &&
    result.sharpeRatio >= 0.5;

  if (passed) {
    console.log("✅ PASS - Strategy meets minimum criteria");

    // Auto-register to winners.json
    const winnersPath = join(__dirname, "strategies", "winners.json");
    try {
      const fs = await import("fs");
      let winnersData: { strategies: any[]; updated?: string } = { strategies: [] };

      if (fs.existsSync(winnersPath)) {
        winnersData = JSON.parse(fs.readFileSync(winnersPath, "utf-8"));
      }

      // Check if already registered for this symbol + interval combination
      // Same strategy can have different entries for different timeframes
      const existingIdx = winnersData.strategies.findIndex(
        (s: any) => s.file === strategyPath && s.interval === interval && s.symbols.includes(symbol)
      );

      if (existingIdx === -1) {
        // Find existing entry for this strategy file + interval
        const fileIdx = winnersData.strategies.findIndex(
          (s: any) => s.file === strategyPath && s.interval === interval
        );

        if (fileIdx >= 0) {
          // Add symbol to existing strategy entry for this interval
          if (!winnersData.strategies[fileIdx].symbols.includes(symbol)) {
            winnersData.strategies[fileIdx].symbols.push(symbol);
            console.log(`  📝 Added ${symbol} to existing strategy @${interval}m in winners.json`);
          }
        } else {
          // Add new strategy entry for this interval
          winnersData.strategies.push({
            file: strategyPath,
            symbols: [symbol],
            interval,
            notes: `Auto-registered @${interval}m: ${result.winRate.toFixed(1)}% WR, ${result.totalPnLPercent.toFixed(2)}% PnL, ${result.sharpeRatio.toFixed(2)} Sharpe`
          });
          console.log(`  📝 Auto-registered to winners.json @${interval}m`);
        }

        winnersData.updated = new Date().toISOString();
        fs.writeFileSync(winnersPath, JSON.stringify(winnersData, null, 2));
      } else {
        console.log(`  📝 Already registered in winners.json @${interval}m`);
      }
    } catch (err: any) {
      console.log(`  ⚠️ Could not auto-register: ${err.message}`);
    }
  } else {
    console.log("❌ FAIL - Strategy does not meet minimum criteria");
    console.log("  Required: trades>=5, winRate>=45%, totalPnL>0, sharpe>=0.5");
  }

  // Return result for programmatic use
  return result;
}

main().catch(console.error);

export { runBacktest, QuickBacktestResult };
