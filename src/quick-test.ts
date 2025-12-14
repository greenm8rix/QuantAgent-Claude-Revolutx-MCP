// Quick test - run backtest on BTC only for speed
import { fetchHistoricalData } from "./utils/revolut-api.js";
import { backtestStrategy, printResults, rankResults } from "./backtester.js";
import { generateAllStrategies } from "./strategy-lab.js";

async function quickTest() {
  console.log("=== Quick Backtest Test ===\n");

  const strategies = generateAllStrategies();
  console.log(`Generated ${strategies.length} strategies\n`);

  // Test on BTC 1h only
  const symbol = "BTC-USD";
  const interval = 60;

  console.log(`Fetching ${symbol} @ ${interval}m candles...`);
  const candles = await fetchHistoricalData(symbol, interval, 500);
  console.log(`Got ${candles.length} candles`);
  console.log(`Price range: $${Math.min(...candles.map(c => c.low)).toFixed(2)} - $${Math.max(...candles.map(c => c.high)).toFixed(2)}`);
  console.log(`Date range: ${new Date(candles[0].start).toISOString()} to ${new Date(candles[candles.length-1].start).toISOString()}\n`);

  console.log("Running backtests...");
  const results = strategies.map(s => backtestStrategy(s, candles, symbol, interval));

  printResults(results, 20);

  // Show top strategy details
  const ranked = rankResults(results);
  if (ranked.length > 0) {
    const best = ranked[0];
    console.log("\n=== BEST STRATEGY DETAILS ===");
    console.log(`ID: ${best.strategyId}`);
    console.log(`Name: ${best.strategyName}`);
    console.log(`Config: ${JSON.stringify(best.config.params, null, 2)}`);
    console.log(`\nSample trades (last 5):`);
    best.trades.slice(-5).forEach((t, i) => {
      console.log(`  ${i+1}. ${t.side.toUpperCase()} @ ${t.entryPrice.toFixed(2)} -> ${t.exitPrice.toFixed(2)} = ${t.pnl >= 0 ? '+' : ''}${t.pnl.toFixed(2)} (${t.pnlPercent.toFixed(2)}%)`);
    });
  }
}

quickTest().catch(console.error);
