// Discover all trading symbols available on Revolut X
import { getTradingPairs, getAllSymbols } from "./utils/revolut-api.js";

async function main() {
  console.log("Fetching all trading pairs from Revolut X...\n");

  try {
    const pairs = await getTradingPairs();

    console.log("=== ALL TRADING PAIRS ===\n");

    const usdPairs: string[] = [];
    const eurPairs: string[] = [];
    const otherPairs: string[] = [];

    for (const [symbol, config] of Object.entries(pairs)) {
      const status = (config as any).status;
      if (symbol.endsWith("/USD")) {
        usdPairs.push(`${symbol} (${status})`);
      } else if (symbol.endsWith("/EUR")) {
        eurPairs.push(`${symbol} (${status})`);
      } else {
        otherPairs.push(`${symbol} (${status})`);
      }
    }

    console.log(`USD Pairs (${usdPairs.length}):`);
    usdPairs.sort().forEach(p => console.log(`  - ${p}`));

    console.log(`\nEUR Pairs (${eurPairs.length}):`);
    eurPairs.sort().forEach(p => console.log(`  - ${p}`));

    console.log(`\nOther Pairs (${otherPairs.length}):`);
    otherPairs.sort().forEach(p => console.log(`  - ${p}`));

    console.log("\n=== ACTIVE USD SYMBOLS (for trading) ===\n");
    const symbols = await getAllSymbols();
    console.log(`Total: ${symbols.length} symbols`);
    console.log(JSON.stringify(symbols, null, 2));

    // Output in format for backtester.ts
    console.log("\n=== COPY FOR BACKTESTER ===\n");
    console.log(`const symbols = ${JSON.stringify(symbols)};`);

  } catch (error) {
    console.error("Error:", error);
  }
}

main();
