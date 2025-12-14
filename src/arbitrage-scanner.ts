// Cross-Currency Arbitrage Scanner for Revolut X
// Finds price discrepancies between USD and EUR pairs
import * as api from "./utils/revolut-api.js";

interface ArbitrageOpportunity {
  symbol: string;         // e.g., "BTC"
  usdPrice: number;       // BTC/USD price
  eurPrice: number;       // BTC/EUR price
  impliedEurUsd: number;  // EUR/USD rate implied from crypto prices
  marketEurUsd: number;   // Actual EUR/USD rate (from USDC/EUR or similar)
  spreadPercent: number;  // Price discrepancy %
  direction: "buy_usd_sell_eur" | "buy_eur_sell_usd";
  expectedProfit: number; // Expected profit after fees
  timestamp: number;
}

// Fee structure on Revolut X
const FEES = {
  maker: 0.001,  // 0.1%
  taker: 0.002,  // 0.2%
  // For arbitrage we'll likely be taker on both sides
  totalRoundTrip: 0.004, // 0.4% total fees for buy + sell
};

// Symbols available in BOTH USD and EUR
const DUAL_CURRENCY_SYMBOLS = [
  "BTC", "ETH", "SOL", "XRP", "DOGE", "ADA", "AVAX", "DOT", "LINK", "LTC",
  "BNB", "SHIB", "ATOM", "UNI", "FIL", "HBAR", "APT", "ARB", "OP", "SUI",
  "INJ", "NEAR", "PEPE", "TRX", "XLM", "ETC", "AAVE", "CHZ", "CRV", "ENA",
  "FET", "FIDA", "FLOKI", "ICP", "JASMY", "LDO", "MAGIC", "ONDO", "POL",
  "RENDER", "SEI", "STRK", "STX", "TIA", "TON", "TRUMP", "WIF", "ZRO",
  "1INCH", "ALGO", "BONK", "PENGU", "SPX",
];

// Get mid price from order book
async function getMidPrice(symbol: string): Promise<number | null> {
  try {
    const orderBook = await api.getOrderBook(symbol, 5);
    if (!orderBook.bids?.length || !orderBook.asks?.length) return null;

    const bestBid = parseFloat(orderBook.bids[0][0]);
    const bestAsk = parseFloat(orderBook.asks[0][0]);
    return (bestBid + bestAsk) / 2;
  } catch (error) {
    return null;
  }
}

// Get bid/ask prices for more accurate arbitrage calculation
async function getBidAsk(symbol: string): Promise<{ bid: number; ask: number } | null> {
  try {
    const orderBook = await api.getOrderBook(symbol, 5);
    if (!orderBook.bids?.length || !orderBook.asks?.length) return null;

    return {
      bid: parseFloat(orderBook.bids[0][0]),
      ask: parseFloat(orderBook.asks[0][0]),
    };
  } catch (error) {
    return null;
  }
}

// Get EUR/USD rate from USDC/EUR pair (inverse)
async function getEurUsdRate(): Promise<number | null> {
  try {
    // USDC/EUR price tells us how many EUR per 1 USDC (≈1 USD)
    const usdcEur = await getMidPrice("USDC-EUR");
    if (!usdcEur) return null;

    // EUR/USD = 1 / (USDC/EUR)
    return 1 / usdcEur;
  } catch (error) {
    console.error("Failed to get EUR/USD rate:", error);
    return null;
  }
}

// Scan for arbitrage opportunities
export async function scanArbitrage(): Promise<ArbitrageOpportunity[]> {
  const opportunities: ArbitrageOpportunity[] = [];

  console.log("=== CROSS-CURRENCY ARBITRAGE SCANNER ===\n");

  // Get EUR/USD rate first
  const eurUsdRate = await getEurUsdRate();
  if (!eurUsdRate) {
    console.error("Could not get EUR/USD rate");
    return [];
  }
  console.log(`EUR/USD rate: ${eurUsdRate.toFixed(4)}\n`);

  for (const symbol of DUAL_CURRENCY_SYMBOLS) {
    try {
      // Get USD pair price
      const usdPair = `${symbol}-USD`;
      const eurPair = `${symbol}-EUR`;

      const [usdPrices, eurPrices] = await Promise.all([
        getBidAsk(usdPair),
        getBidAsk(eurPair),
      ]);

      if (!usdPrices || !eurPrices) continue;

      const usdMid = (usdPrices.bid + usdPrices.ask) / 2;
      const eurMid = (eurPrices.bid + eurPrices.ask) / 2;

      // Convert EUR price to USD using market rate
      const eurPriceInUsd = eurMid * eurUsdRate;

      // Calculate implied EUR/USD from crypto prices
      const impliedEurUsd = usdMid / eurMid;

      // Calculate spread
      const spreadPercent = ((usdMid - eurPriceInUsd) / eurPriceInUsd) * 100;

      // Determine direction and profitability
      let direction: "buy_usd_sell_eur" | "buy_eur_sell_usd";
      let expectedProfit: number;

      if (spreadPercent > 0) {
        // USD price is higher - buy EUR, sell USD
        direction = "buy_eur_sell_usd";
        // Buy at EUR ask, sell at USD bid
        const buyPrice = eurPrices.ask * eurUsdRate; // Cost in USD
        const sellPrice = usdPrices.bid;             // Revenue in USD
        expectedProfit = ((sellPrice - buyPrice) / buyPrice) * 100 - (FEES.totalRoundTrip * 100);
      } else {
        // EUR price is higher - buy USD, sell EUR
        direction = "buy_usd_sell_eur";
        // Buy at USD ask, sell at EUR bid (converted)
        const buyPrice = usdPrices.ask;
        const sellPrice = eurPrices.bid * eurUsdRate;
        expectedProfit = ((sellPrice - buyPrice) / buyPrice) * 100 - (FEES.totalRoundTrip * 100);
      }

      // Only report if spread is meaningful
      if (Math.abs(spreadPercent) > 0.1) {
        const opportunity: ArbitrageOpportunity = {
          symbol,
          usdPrice: usdMid,
          eurPrice: eurMid,
          impliedEurUsd,
          marketEurUsd: eurUsdRate,
          spreadPercent,
          direction,
          expectedProfit,
          timestamp: Date.now(),
        };

        opportunities.push(opportunity);

        const profitable = expectedProfit > 0;
        const emoji = profitable ? "🟢" : "🔴";
        console.log(`${emoji} ${symbol}: spread ${spreadPercent.toFixed(3)}%, profit ${expectedProfit.toFixed(3)}% (${direction})`);
        console.log(`   USD: $${usdMid.toFixed(4)} | EUR: €${eurMid.toFixed(4)} → $${eurPriceInUsd.toFixed(4)}`);
      }

      // Small delay to avoid rate limits
      await new Promise(r => setTimeout(r, 100));

    } catch (error) {
      // Skip symbols with errors
    }
  }

  // Sort by expected profit
  opportunities.sort((a, b) => b.expectedProfit - a.expectedProfit);

  console.log("\n=== SUMMARY ===");
  const profitable = opportunities.filter(o => o.expectedProfit > 0);
  console.log(`Total opportunities found: ${opportunities.length}`);
  console.log(`Profitable after fees: ${profitable.length}`);

  if (profitable.length > 0) {
    console.log("\nTop profitable opportunities:");
    for (const opp of profitable.slice(0, 5)) {
      console.log(`  ${opp.symbol}: +${opp.expectedProfit.toFixed(3)}% (${opp.direction})`);
    }
  }

  return opportunities;
}

// Triangular arbitrage: USD → Crypto → EUR → USD
export async function scanTriangularArbitrage(): Promise<void> {
  console.log("\n=== TRIANGULAR ARBITRAGE SCANNER ===\n");
  console.log("Route: USD → Crypto → EUR → USD\n");

  const eurUsdRate = await getEurUsdRate();
  if (!eurUsdRate) {
    console.error("Could not get EUR/USD rate");
    return;
  }

  // For each crypto, calculate if triangular arbitrage is profitable:
  // 1. Start with $1000 USD
  // 2. Buy crypto with USD
  // 3. Sell crypto for EUR
  // 4. Convert EUR back to USD
  // 5. Compare final USD vs initial

  const startingUsd = 1000;

  for (const symbol of DUAL_CURRENCY_SYMBOLS.slice(0, 20)) { // Top 20 for speed
    try {
      const usdPair = `${symbol}-USD`;
      const eurPair = `${symbol}-EUR`;

      const [usdPrices, eurPrices] = await Promise.all([
        getBidAsk(usdPair),
        getBidAsk(eurPair),
      ]);

      if (!usdPrices || !eurPrices) continue;

      // Route 1: USD → Crypto → EUR → USD
      // Buy crypto with USD (pay ask)
      const cryptoAmount = (startingUsd * (1 - FEES.taker)) / usdPrices.ask;
      // Sell crypto for EUR (receive bid)
      const eurAmount = cryptoAmount * eurPrices.bid * (1 - FEES.taker);
      // Convert EUR to USD
      const finalUsd1 = eurAmount * eurUsdRate;
      const profit1 = ((finalUsd1 - startingUsd) / startingUsd) * 100;

      // Route 2: USD → EUR → Crypto → USD
      // Convert USD to EUR first
      const eurFromUsd = startingUsd / eurUsdRate;
      // Buy crypto with EUR (pay ask)
      const cryptoAmount2 = (eurFromUsd * (1 - FEES.taker)) / eurPrices.ask;
      // Sell crypto for USD (receive bid)
      const finalUsd2 = cryptoAmount2 * usdPrices.bid * (1 - FEES.taker);
      const profit2 = ((finalUsd2 - startingUsd) / startingUsd) * 100;

      const bestProfit = Math.max(profit1, profit2);
      const bestRoute = profit1 > profit2 ? "USD→Crypto→EUR→USD" : "USD→EUR→Crypto→USD";

      if (bestProfit > -0.5) { // Show if loss is less than 0.5%
        const emoji = bestProfit > 0 ? "🟢" : "🟡";
        console.log(`${emoji} ${symbol}: ${bestProfit.toFixed(3)}% via ${bestRoute}`);
      }

      await new Promise(r => setTimeout(r, 100));

    } catch (error) {
      // Skip
    }
  }
}

// Real-time arbitrage monitor
export async function monitorArbitrage(intervalMs = 30000): Promise<void> {
  console.log("Starting arbitrage monitor...");
  console.log(`Checking every ${intervalMs / 1000} seconds\n`);

  while (true) {
    const opportunities = await scanArbitrage();

    // Alert on profitable opportunities
    const profitable = opportunities.filter(o => o.expectedProfit > 0.1);
    if (profitable.length > 0) {
      console.log("\n🚨 PROFITABLE ARBITRAGE DETECTED!");
      for (const opp of profitable) {
        console.log(`   ${opp.symbol}: +${opp.expectedProfit.toFixed(3)}%`);
      }
    }

    await new Promise(r => setTimeout(r, intervalMs));
  }
}

// CLI entry point
async function main() {
  const command = process.argv[2] || "scan";

  switch (command) {
    case "scan":
      await scanArbitrage();
      break;
    case "triangular":
      await scanTriangularArbitrage();
      break;
    case "monitor":
      await monitorArbitrage();
      break;
    default:
      console.log(`
Arbitrage Scanner - Cross-Currency Opportunities

Usage: npx tsx src/arbitrage-scanner.ts [command]

Commands:
  scan        - Scan for USD/EUR price discrepancies (default)
  triangular  - Scan for triangular arbitrage opportunities
  monitor     - Continuously monitor for arbitrage
      `);
  }
}

main().catch(console.error);
