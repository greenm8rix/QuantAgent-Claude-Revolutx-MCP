#!/usr/bin/env npx tsx
// V10 Strategy Batch Tester
// Tests all new V10 strategies across multiple symbols and intervals

import * as api from "./utils/revolut-api.js";
import { join, dirname } from "path";
import { fileURLToPath, pathToFileURL } from "url";
import type { Strategy } from "./strategies/index.js";
import type { Candle } from "./indicators/index.js";
import * as fs from "fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

interface BacktestResult {
  strategy: string;
  symbol: string;
  interval: number;
  trades: number;
  winRate: number;
  pnlPercent: number;
  sharpe: number;
  maxDD: number;
  profitFactor: number;
}

// V10 strategies to test
const V10_STRATEGIES = [
  "momentum/fast-macd-momentum.ts",
  "momentum/kst-adx-power.ts",
  "momentum/squeeze-breakout-v10.ts",
  "momentum/volume-delta-momentum.ts",
  "composite/adaptive-multi-indicator.ts",
  "composite/ichimoku-momentum-hybrid.ts",
  "composite/regime-adaptive-momentum.ts",
  "composite/triple-momentum-confluence.ts",
  "mean-reversion/absorption-reversal.ts",
];

// Top symbols to test (known performers)
const TEST_SYMBOLS = [
  "BTC-USD",
  "ETH-USD",
  "SOL-USD",
  "DOGE-USD",
  "ADA-USD",
  "AVAX-USD",
  "XRP-USD",
  "DOT-USD",
  "MATIC-USD",
  "LINK-USD",
  "ARPA-USD", // Known performer
  "TIA-USD",
  "HBAR-USD",
];

// Intervals to test
const INTERVALS = [15, 60, 240];

async function loadStrategy(path: string): Promise<Strategy | null> {
  try {
    const fullPath = join(__dirname, "strategies", path);
    const fileUrl = pathToFileURL(fullPath).href;
    const module = await import(fileUrl);
    const strategy = module.default;
    if (strategy && strategy.id && typeof strategy.analyze === "function") {
      return strategy;
    }
    return null;
  } catch (error: any) {
    console.error(`Failed to load ${path}: ${error.message}`);
    return null;
  }
}

async function runBacktest(
  strategy: Strategy,
  candles: Candle[],
  symbol: string,
  interval: number
): Promise<BacktestResult> {
  const trades: { pnl: number }[] = [];
  let position: { side: "long" | "short"; entry: number } | null = null;
  let equity = 100;
  let peak = 100;
  let maxDD = 0;

  if (strategy.initialize) {
    await strategy.initialize(candles);
  }

  for (let i = 50; i < candles.length; i++) {
    const slice = candles.slice(0, i + 1);
    const signal = await strategy.analyze(slice);
    const price = candles[i].close;

    if (position) {
      const exit =
        (position.side === "long" && signal === "sell") ||
        (position.side === "short" && signal === "buy");

      if (exit) {
        const pnl =
          position.side === "long"
            ? ((price - position.entry) / position.entry) * 100
            : ((position.entry - price) / position.entry) * 100;

        trades.push({ pnl });
        equity *= 1 + pnl / 100;

        if (equity > peak) peak = equity;
        const dd = ((peak - equity) / peak) * 100;
        if (dd > maxDD) maxDD = dd;

        position = null;
      }
    }

    if (!position && signal !== "hold") {
      position = { side: signal === "buy" ? "long" : "short", entry: price };
    }
  }

  // Close open position
  if (position) {
    const lastPrice = candles[candles.length - 1].close;
    const pnl =
      position.side === "long"
        ? ((lastPrice - position.entry) / position.entry) * 100
        : ((position.entry - lastPrice) / position.entry) * 100;
    trades.push({ pnl });
  }

  const wins = trades.filter((t) => t.pnl > 0).length;
  const totalPnL = trades.reduce((s, t) => s + t.pnl, 0);
  const avgPnL = trades.length > 0 ? totalPnL / trades.length : 0;
  const stdDev =
    trades.length > 1
      ? Math.sqrt(
          trades.reduce((s, t) => s + Math.pow(t.pnl - avgPnL, 2), 0) / trades.length
        )
      : 1;
  const sharpe = stdDev > 0 ? avgPnL / stdDev : 0;

  const grossProfit = trades.filter((t) => t.pnl > 0).reduce((s, t) => s + t.pnl, 0);
  const grossLoss = Math.abs(trades.filter((t) => t.pnl < 0).reduce((s, t) => s + t.pnl, 0));
  const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? 99 : 0;

  return {
    strategy: strategy.id,
    symbol,
    interval,
    trades: trades.length,
    winRate: trades.length > 0 ? (wins / trades.length) * 100 : 0,
    pnlPercent: totalPnL,
    sharpe,
    maxDD,
    profitFactor,
  };
}

async function main() {
  console.log("\n=== V10 Strategy Batch Tester ===\n");

  const results: BacktestResult[] = [];
  const winners: BacktestResult[] = [];

  // Load all strategies
  const strategies: { path: string; strategy: Strategy }[] = [];
  for (const path of V10_STRATEGIES) {
    const strategy = await loadStrategy(path);
    if (strategy) {
      strategies.push({ path, strategy });
      console.log(`Loaded: ${strategy.name}`);
    }
  }

  console.log(`\nTesting ${strategies.length} strategies on ${TEST_SYMBOLS.length} symbols...\n`);

  // Test each combination
  for (const symbol of TEST_SYMBOLS) {
    for (const interval of INTERVALS) {
      console.log(`\nFetching ${symbol} @ ${interval}m...`);
      let candles: Candle[];
      try {
        candles = await api.fetchHistoricalData(symbol, interval, 500);
      } catch (e: any) {
        console.log(`  Skipping: ${e.message}`);
        continue;
      }

      if (candles.length < 100) {
        console.log(`  Skipping: only ${candles.length} candles`);
        continue;
      }

      for (const { path, strategy } of strategies) {
        try {
          const result = await runBacktest(strategy, candles, symbol, interval);
          results.push(result);

          // Check if winner
          if (
            result.trades >= 5 &&
            result.winRate >= 45 &&
            result.pnlPercent > 0 &&
            result.sharpe >= 0.5
          ) {
            winners.push(result);
            console.log(
              `  ✅ ${strategy.id.padEnd(45)} ${result.trades}T ${result.winRate.toFixed(0)}%WR ${result.pnlPercent.toFixed(1)}%PnL S=${result.sharpe.toFixed(1)}`
            );
          }
        } catch (e: any) {
          console.log(`  ❌ ${strategy.id}: ${e.message}`);
        }
      }
    }
  }

  // Sort winners by PnL
  winners.sort((a, b) => b.pnlPercent - a.pnlPercent);

  // Save results
  const resultsPath = join(__dirname, "../results/v10_backtest_results.json");
  fs.writeFileSync(resultsPath, JSON.stringify({ results, winners, tested: new Date().toISOString() }, null, 2));

  // Display top performers
  console.log("\n\n=== TOP V10 PERFORMERS ===\n");
  winners.slice(0, 20).forEach((r, i) => {
    console.log(
      `${(i + 1).toString().padStart(2)}. ${r.strategy.padEnd(45)} ${r.symbol.padEnd(12)} @${String(r.interval).padStart(3)}m ` +
        `${r.trades}T ${r.winRate.toFixed(0)}%WR ${r.pnlPercent.toFixed(1)}%PnL S=${r.sharpe.toFixed(1)}`
    );
  });

  console.log(`\n\nTotal tests: ${results.length}`);
  console.log(`Winners: ${winners.length}`);
  console.log(`Results saved to: ${resultsPath}\n`);
}

main().catch(console.error);
