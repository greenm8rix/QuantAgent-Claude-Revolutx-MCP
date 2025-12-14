#!/usr/bin/env npx tsx
// Batch Symbol Tester - Tests all strategies on all high-volume symbols
// Automatically expands winners.json coverage
// Usage: npx tsx src/batch-symbol-tester.ts [minVolumeMillions]
// Example: npx tsx src/batch-symbol-tester.ts 1  (default: 1M volume)

import * as fs from "fs";
import * as path from "path";
import { fileURLToPath, pathToFileURL } from "url";
import * as api from "./utils/revolut-api.js";
import type { Strategy } from "./strategies/index.js";
import type { Candle } from "./indicators/index.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Get minimum volume from CLI args (default: 1 million USD)
const MIN_VOLUME_USD = (parseInt(process.argv[2] || "1", 10) || 1) * 1000000;

const INTERVALS = [15, 60]; // Test on 15m and 1h

interface BacktestResult {
  strategyId: string;
  symbol: string;
  interval: number;
  totalTrades: number;
  winRate: number;
  totalPnLPercent: number;
  sharpeRatio: number;
  profitFactor: number;
  passed: boolean;
}

// Pass criteria
const MIN_TRADES = 5;
const MIN_WIN_RATE = 45;
const MIN_SHARPE = 0.5;
const MIN_PNL = 0;

async function runBacktest(
  strategy: Strategy,
  candles: Candle[],
  symbol: string,
  interval: number
): Promise<BacktestResult> {
  const trades: { pnlPercent: number }[] = [];
  let position: { side: "long" | "short"; entryPrice: number } | null = null;

  if (strategy.initialize) {
    await strategy.initialize(candles);
  }

  for (let i = 50; i < candles.length; i++) {
    const slice = candles.slice(0, i + 1);
    const signal = await strategy.analyze(slice);
    const price = candles[i].close;

    if (position) {
      const shouldExit =
        (position.side === "long" && signal === "sell") ||
        (position.side === "short" && signal === "buy");

      if (shouldExit) {
        const pnlPercent = position.side === "long"
          ? ((price - position.entryPrice) / position.entryPrice) * 100
          : ((position.entryPrice - price) / position.entryPrice) * 100;
        trades.push({ pnlPercent });
        position = null;
      }
    }

    if (!position && signal !== "hold") {
      position = {
        side: signal === "buy" ? "long" : "short",
        entryPrice: price,
      };
    }
  }

  // Close open position
  if (position) {
    const lastPrice = candles[candles.length - 1].close;
    const pnlPercent = position.side === "long"
      ? ((lastPrice - position.entryPrice) / position.entryPrice) * 100
      : ((position.entryPrice - lastPrice) / position.entryPrice) * 100;
    trades.push({ pnlPercent });
  }

  const wins = trades.filter(t => t.pnlPercent > 0).length;
  const totalPnL = trades.reduce((sum, t) => sum + t.pnlPercent, 0);
  const avgTrade = trades.length > 0 ? totalPnL / trades.length : 0;

  const returns = trades.map(t => t.pnlPercent);
  const avgReturn = returns.length > 0 ? returns.reduce((a, b) => a + b, 0) / returns.length : 0;
  const stdDev = returns.length > 1
    ? Math.sqrt(returns.reduce((sum, r) => sum + Math.pow(r - avgReturn, 2), 0) / returns.length)
    : 1;
  const sharpe = stdDev > 0 ? avgReturn / stdDev : 0;

  const grossProfit = trades.filter(t => t.pnlPercent > 0).reduce((s, t) => s + t.pnlPercent, 0);
  const grossLoss = Math.abs(trades.filter(t => t.pnlPercent < 0).reduce((s, t) => s + t.pnlPercent, 0));
  const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? Infinity : 0;

  const passed = trades.length >= MIN_TRADES &&
    (wins / trades.length) * 100 >= MIN_WIN_RATE &&
    totalPnL > MIN_PNL &&
    sharpe >= MIN_SHARPE;

  return {
    strategyId: strategy.id,
    symbol,
    interval,
    totalTrades: trades.length,
    winRate: trades.length > 0 ? (wins / trades.length) * 100 : 0,
    totalPnLPercent: totalPnL,
    sharpeRatio: sharpe,
    profitFactor,
    passed,
  };
}

async function loadStrategy(filePath: string): Promise<Strategy | null> {
  try {
    const fullPath = path.join(__dirname, "strategies", filePath);
    const moduleUrl = pathToFileURL(fullPath).href;
    const module = await import(moduleUrl);
    return module.default;
  } catch (error: any) {
    console.error(`  Failed to load ${filePath}: ${error.message}`);
    return null;
  }
}

async function main() {
  console.log("\n=== Batch Symbol Tester ===\n");

  // Use getAllSymbols() which works reliably
  console.log("Fetching all active USD symbols from Revolut API...\n");
  const TOP_SYMBOLS = await api.getAllSymbols();

  if (TOP_SYMBOLS.length === 0) {
    console.error("No symbols found.");
    process.exit(1);
  }

  console.log(`Found ${TOP_SYMBOLS.length} active symbols`);
  console.log(`Testing on ${INTERVALS.length} intervals\n`);

  // Load winners.json
  const winnersPath = path.join(__dirname, "strategies", "winners.json");
  let winnersData: { strategies: any[]; updated?: string; description?: string } = {
    strategies: [],
    description: "Winning strategies that have passed testing. Executor loads and trades these automatically."
  };

  if (fs.existsSync(winnersPath)) {
    winnersData = JSON.parse(fs.readFileSync(winnersPath, "utf-8"));
  }

  // Get unique strategy files
  const strategyFiles = new Set<string>();
  for (const entry of winnersData.strategies) {
    strategyFiles.add(entry.file);
  }

  // Also scan directories for strategies not yet in winners.json
  const strategyDirs = ["momentum", "mean-reversion", "ml-features", "composite"];
  for (const dir of strategyDirs) {
    const dirPath = path.join(__dirname, "strategies", dir);
    if (fs.existsSync(dirPath) && fs.statSync(dirPath).isDirectory()) {
      for (const file of fs.readdirSync(dirPath)) {
        if (file.endsWith(".ts") && !file.startsWith("_")) {
          strategyFiles.add(`${dir}/${file}`);
        }
      }
    }
  }

  console.log(`Found ${strategyFiles.size} strategies to test\n`);

  const results: BacktestResult[] = [];
  let newRegistrations = 0;

  for (const strategyFile of strategyFiles) {
    console.log(`\nTesting: ${strategyFile}`);
    const strategy = await loadStrategy(strategyFile);
    if (!strategy) continue;

    for (const interval of INTERVALS) {
      for (const symbol of TOP_SYMBOLS) {
        process.stdout.write(`  ${symbol}@${interval}m... `);

        try {
          const candles = await api.fetchHistoricalData(symbol, interval, 500);
          if (candles.length < 100) {
            console.log("skip (insufficient data)");
            continue;
          }

          const result = await runBacktest(strategy, candles, symbol, interval);
          results.push(result);

          if (result.passed) {
            console.log(`PASS (${result.winRate.toFixed(0)}% WR, ${result.totalPnLPercent.toFixed(1)}% PnL)`);

            // Auto-register to winners.json - match by BOTH file AND interval
            // This allows same strategy to have different symbol lists for different timeframes
            const existingIdx = winnersData.strategies.findIndex(
              (s: any) => s.file === strategyFile && s.interval === interval
            );

            if (existingIdx >= 0) {
              if (!winnersData.strategies[existingIdx].symbols.includes(symbol)) {
                winnersData.strategies[existingIdx].symbols.push(symbol);
                newRegistrations++;
              }
            } else {
              // Create new entry for this strategy+interval combination
              winnersData.strategies.push({
                file: strategyFile,
                symbols: [symbol],
                interval,
                notes: `Auto-registered @${interval}m: ${result.winRate.toFixed(1)}% WR, ${result.totalPnLPercent.toFixed(2)}% PnL`
              });
              newRegistrations++;
            }
          } else {
            console.log(`fail (${result.totalTrades} trades, ${result.winRate.toFixed(0)}% WR)`);
          }

          // Rate limit
          await new Promise(r => setTimeout(r, 500));
        } catch (error: any) {
          console.log(`error: ${error.message}`);
        }
      }
    }
  }

  // Save updated winners.json
  winnersData.updated = new Date().toISOString();
  fs.writeFileSync(winnersPath, JSON.stringify(winnersData, null, 2));

  console.log("\n=== Summary ===");
  console.log(`Total tests: ${results.length}`);
  console.log(`Passed: ${results.filter(r => r.passed).length}`);
  console.log(`New registrations: ${newRegistrations}`);
  console.log(`Winners.json updated with ${winnersData.strategies.length} strategies`);

  // Show coverage
  const allSymbols = new Set<string>();
  for (const entry of winnersData.strategies) {
    for (const sym of entry.symbols) {
      allSymbols.add(sym);
    }
  }
  console.log(`\nSymbol coverage: ${allSymbols.size} symbols`);
  console.log(`Symbols: ${Array.from(allSymbols).join(", ")}`);
}

main().catch(console.error);
