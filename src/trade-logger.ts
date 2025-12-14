// Trade Logger - Records live trades for Claude to analyze
import * as fs from "fs";
import * as path from "path";

const TRADES_FILE = path.join(process.cwd(), "results", "live_trades.json");
const PERFORMANCE_FILE = path.join(process.cwd(), "results", "live_performance.json");

export interface LiveTrade {
  id: string;
  timestamp: number;
  symbol: string;
  side: "buy" | "sell";
  price: number;
  quantity: number;
  strategyId: string;
  pnl?: number;
  pnlPercent?: number;
  status: "open" | "closed";
  closeTimestamp?: number;
  closePrice?: number;
}

export interface DailyPerformance {
  date: string;
  trades: number;
  wins: number;
  losses: number;
  pnl: number;
  pnlPercent: number;
  bestStrategy: string;
  worstStrategy: string;
}

// Load existing trades
function loadTrades(): LiveTrade[] {
  if (fs.existsSync(TRADES_FILE)) {
    return JSON.parse(fs.readFileSync(TRADES_FILE, "utf-8"));
  }
  return [];
}

// Save trades
function saveTrades(trades: LiveTrade[]): void {
  fs.writeFileSync(TRADES_FILE, JSON.stringify(trades, null, 2));
}

// Log a new trade
export function logTrade(trade: Omit<LiveTrade, "id" | "timestamp" | "status">): string {
  const trades = loadTrades();
  const newTrade: LiveTrade = {
    ...trade,
    id: `trade_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    timestamp: Date.now(),
    status: "open",
  };
  trades.push(newTrade);
  saveTrades(trades);
  console.log(`[TRADE LOG] Opened: ${newTrade.symbol} ${newTrade.side} @ ${newTrade.price}`);
  return newTrade.id;
}

// Close a trade and calculate PnL
export function closeTrade(tradeId: string, closePrice: number): void {
  const trades = loadTrades();
  const trade = trades.find(t => t.id === tradeId);

  if (!trade || trade.status === "closed") return;

  trade.status = "closed";
  trade.closeTimestamp = Date.now();
  trade.closePrice = closePrice;

  // Calculate PnL
  if (trade.side === "buy") {
    trade.pnlPercent = ((closePrice - trade.price) / trade.price) * 100;
  } else {
    trade.pnlPercent = ((trade.price - closePrice) / trade.price) * 100;
  }
  trade.pnl = (trade.pnlPercent / 100) * trade.quantity * trade.price;

  saveTrades(trades);
  console.log(`[TRADE LOG] Closed: ${trade.symbol} PnL: ${trade.pnl >= 0 ? "+" : ""}${trade.pnl.toFixed(2)} (${trade.pnlPercent.toFixed(2)}%)`);

  // Update daily performance
  updateDailyPerformance(trade);
}

// Update daily performance metrics
function updateDailyPerformance(trade: LiveTrade): void {
  const performances: DailyPerformance[] = fs.existsSync(PERFORMANCE_FILE)
    ? JSON.parse(fs.readFileSync(PERFORMANCE_FILE, "utf-8"))
    : [];

  const today = new Date().toISOString().split("T")[0];
  let todayPerf = performances.find(p => p.date === today);

  if (!todayPerf) {
    todayPerf = {
      date: today,
      trades: 0,
      wins: 0,
      losses: 0,
      pnl: 0,
      pnlPercent: 0,
      bestStrategy: "",
      worstStrategy: "",
    };
    performances.push(todayPerf);
  }

  todayPerf.trades++;
  if (trade.pnl && trade.pnl > 0) todayPerf.wins++;
  if (trade.pnl && trade.pnl < 0) todayPerf.losses++;
  todayPerf.pnl += trade.pnl || 0;

  fs.writeFileSync(PERFORMANCE_FILE, JSON.stringify(performances, null, 2));
}

// Get performance summary for Claude
export function getPerformanceSummary(): string {
  const trades = loadTrades().filter(t => t.status === "closed");
  const performances: DailyPerformance[] = fs.existsSync(PERFORMANCE_FILE)
    ? JSON.parse(fs.readFileSync(PERFORMANCE_FILE, "utf-8"))
    : [];

  if (trades.length === 0) {
    return "No live trades recorded yet.";
  }

  const totalPnL = trades.reduce((sum, t) => sum + (t.pnl || 0), 0);
  const winRate = (trades.filter(t => (t.pnl || 0) > 0).length / trades.length) * 100;

  // Strategy performance
  const strategyPnL: Record<string, number> = {};
  for (const trade of trades) {
    strategyPnL[trade.strategyId] = (strategyPnL[trade.strategyId] || 0) + (trade.pnl || 0);
  }

  const sortedStrategies = Object.entries(strategyPnL).sort((a, b) => b[1] - a[1]);

  let summary = `
=== LIVE TRADING PERFORMANCE ===
Total trades: ${trades.length}
Win rate: ${winRate.toFixed(1)}%
Total PnL: $${totalPnL.toFixed(2)}

Top performing strategies (LIVE):
${sortedStrategies.slice(0, 5).map(([s, pnl]) => `  ${s}: $${pnl.toFixed(2)}`).join("\n")}

Worst performing strategies (LIVE):
${sortedStrategies.slice(-3).map(([s, pnl]) => `  ${s}: $${pnl.toFixed(2)}`).join("\n")}

Last 7 days:
${performances.slice(-7).map(p => `  ${p.date}: ${p.trades} trades, $${p.pnl.toFixed(2)} PnL`).join("\n")}
`;

  return summary;
}
