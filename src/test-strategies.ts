// Quick test to verify strategy lab compiles and generates strategies
import { generateAllStrategies, executeStrategy } from "./strategy-lab.js";
import { fetchHistoricalData } from "./utils/revolut-api.js";

async function testStrategies() {
  console.log("=== Testing Strategy Lab V2 ===\n");
  
  // Generate strategies
  const strategies = generateAllStrategies();
  console.log(`Generated ${strategies.length} strategies\n`);
  
  // Group by type
  const byType: Record<string, number> = {};
  for (const s of strategies) {
    const type = s.id.split("_").slice(0, 2).join("_");
    byType[type] = (byType[type] || 0) + 1;
  }
  
  console.log("Strategies by type:");
  for (const [type, count] of Object.entries(byType)) {
    console.log(`  ${type}: ${count}`);
  }
  
  // Fetch some data and test execution
  console.log("\nFetching BTC-USD 15m data...");
  const candles = await fetchHistoricalData("BTC-USD", 15, 200);
  console.log(`Got ${candles.length} candles`);
  
  // Test first 5 strategies
  console.log("\nTesting strategy execution on first 5 strategies...");
  for (let i = 0; i < Math.min(5, strategies.length); i++) {
    const strategy = strategies[i];
    try {
      const result = executeStrategy(strategy, candles);
      const buys = result.signals.filter(s => s === "buy").length;
      const sells = result.signals.filter(s => s === "sell").length;
      console.log(`  ${strategy.id}: ${buys} buys, ${sells} sells`);
    } catch (e) {
      console.log(`  ${strategy.id}: ERROR - ${e}`);
    }
  }
  
  console.log("\n=== Test Complete ===");
}

testStrategies().catch(console.error);
