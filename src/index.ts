// Main Orchestrator - 24/7 Autonomous Quant Agent
// SIMPLIFIED: Only uses modular strategies from winners.json
import { spawn, ChildProcess } from "child_process";
import * as fs from "fs";
import * as path from "path";
import { pathToFileURL } from "url";
import { Executor } from "./executor.js";
import * as api from "./utils/revolut-api.js";

interface AgentState {
  mode: "backtest" | "iterate" | "execute" | "idle";
  lastBacktest: number;
  lastIteration: number;
  iterationCount: number;
  dailyPnL: number;
  totalPnL: number;
  startTime: number;
}

const STATE_FILE = path.join(process.cwd(), "agent_state.json");
const RESULTS_DIR = path.join(process.cwd(), "results");

// Schedule configuration (all in ms)
const SCHEDULE = {
  iterationInterval: 6 * 60 * 60 * 1000, // Every 6 hours - Claude creates/improves strategies
  statusLogInterval: 60 * 1000, // Every minute
};

// ============ TRADE HISTORY ANALYSIS ============

interface TradeRecord {
  symbol: string;
  side: string;
  entryPrice: number;
  exitPrice?: number;
  pnl?: number;
  pnlPercent?: number;
  reason?: string;
  strategyId: string;
  strategyType?: string;
  entryTime: number;
  exitTime?: number;
  atrAtEntry?: number;
}

interface StrategyPerformance {
  strategyId: string;
  trades: number;
  wins: number;
  losses: number;
  winRate: number;
  totalPnL: number;
  avgPnL: number;
  avgWin: number;
  avgLoss: number;
  bestTrade: number;
  worstTrade: number;
}

interface TradeAnalysis {
  totalTrades: number;
  wins: number;
  losses: number;
  winRate: number;
  totalPnL: number;
  avgPnL: number;
  todayPnL: number;
  weekPnL: number;
  strategyBreakdown: StrategyPerformance[];
  recentTrades: TradeRecord[];
  failingStrategies: string[];
  topStrategies: string[];
}

function loadTradeHistory(): TradeRecord[] {
  const positionsFile = path.join(process.cwd(), "positions.json");
  if (!fs.existsSync(positionsFile)) return [];

  try {
    const data = JSON.parse(fs.readFileSync(positionsFile, "utf-8"));
    return data.history || [];
  } catch {
    return [];
  }
}

function analyzeTradeHistory(): TradeAnalysis {
  const history = loadTradeHistory();
  const now = Date.now();
  const oneDayAgo = now - 24 * 60 * 60 * 1000;
  const oneWeekAgo = now - 7 * 24 * 60 * 60 * 1000;

  // Aggregate by strategy
  const strategyMap = new Map<string, TradeRecord[]>();
  for (const trade of history) {
    const id = trade.strategyId || "unknown";
    if (!strategyMap.has(id)) strategyMap.set(id, []);
    strategyMap.get(id)!.push(trade);
  }

  // Calculate per-strategy metrics
  const strategyBreakdown: StrategyPerformance[] = [];
  for (const [strategyId, trades] of strategyMap) {
    const wins = trades.filter(t => (t.pnl || 0) > 0);
    const losses = trades.filter(t => (t.pnl || 0) <= 0);
    const totalPnL = trades.reduce((sum, t) => sum + (t.pnl || 0), 0);
    const avgWin = wins.length > 0 ? wins.reduce((s, t) => s + (t.pnl || 0), 0) / wins.length : 0;
    const avgLoss = losses.length > 0 ? losses.reduce((s, t) => s + (t.pnl || 0), 0) / losses.length : 0;

    strategyBreakdown.push({
      strategyId,
      trades: trades.length,
      wins: wins.length,
      losses: losses.length,
      winRate: trades.length > 0 ? (wins.length / trades.length) * 100 : 0,
      totalPnL,
      avgPnL: trades.length > 0 ? totalPnL / trades.length : 0,
      avgWin,
      avgLoss,
      bestTrade: Math.max(...trades.map(t => t.pnl || 0)),
      worstTrade: Math.min(...trades.map(t => t.pnl || 0)),
    });
  }

  // Sort by performance
  strategyBreakdown.sort((a, b) => b.totalPnL - a.totalPnL);

  // Overall metrics
  const totalTrades = history.length;
  const wins = history.filter(t => (t.pnl || 0) > 0).length;
  const losses = history.filter(t => (t.pnl || 0) <= 0).length;
  const totalPnL = history.reduce((sum, t) => sum + (t.pnl || 0), 0);

  // Time-based metrics
  const todayTrades = history.filter(t => (t.exitTime || t.entryTime) > oneDayAgo);
  const weekTrades = history.filter(t => (t.exitTime || t.entryTime) > oneWeekAgo);
  const todayPnL = todayTrades.reduce((sum, t) => sum + (t.pnl || 0), 0);
  const weekPnL = weekTrades.reduce((sum, t) => sum + (t.pnl || 0), 0);

  // Identify failing and top strategies
  const failingStrategies = strategyBreakdown
    .filter(s => s.trades >= 3 && s.winRate < 40)
    .map(s => s.strategyId);

  const topStrategies = strategyBreakdown
    .filter(s => s.trades >= 3 && s.winRate > 60)
    .slice(0, 5)
    .map(s => s.strategyId);

  return {
    totalTrades,
    wins,
    losses,
    winRate: totalTrades > 0 ? (wins / totalTrades) * 100 : 0,
    totalPnL,
    avgPnL: totalTrades > 0 ? totalPnL / totalTrades : 0,
    todayPnL,
    weekPnL,
    strategyBreakdown,
    recentTrades: history.slice(-20).reverse(),
    failingStrategies,
    topStrategies,
  };
}

// ============ MARKET DATA FOR CLAUDE ============
// Fetch data for ALL traded symbols - let Claude analyze

interface SymbolData {
  symbol: string;
  price: number;
  change1h: number;
  change24h: number;
  atrPercent: number;
  ema9: number;
  ema21: number;
  high24h: number;
  low24h: number;
  volume24h: number;
}

interface MarketSnapshot {
  timestamp: string;
  symbols: SymbolData[];
  btcDominance?: number;  // BTC as market leader
}

async function fetchMarketData(): Promise<MarketSnapshot | null> {
  try {
    // Load active trading symbols from top_strategies.json
    const topStrategiesFile = path.join(process.cwd(), "top_strategies.json");
    let symbols: string[] = ["BTC-USD", "ETH-USD", "SOL-USD"];  // Defaults

    if (fs.existsSync(topStrategiesFile)) {
      const strategies = JSON.parse(fs.readFileSync(topStrategiesFile, "utf-8"));
      symbols = [...new Set(strategies.slice(0, 20).map((s: any) => s.symbol))] as string[];
    }

    const symbolData: SymbolData[] = [];

    // Fetch data for each symbol (limit to 10 to avoid rate limits)
    for (const symbol of symbols.slice(0, 10)) {
      try {
        const candles = await api.fetchHistoricalData(symbol, 60, 30);
        if (candles.length < 24) continue;

        const current = candles[candles.length - 1];
        const hourAgo = candles[candles.length - 2]?.close || current.close;
        const dayAgo = candles[candles.length - 24]?.close || current.close;

        // Calculate ATR
        let atrSum = 0;
        for (let i = 1; i < candles.length; i++) {
          const tr = Math.max(
            candles[i].high - candles[i].low,
            Math.abs(candles[i].high - candles[i - 1].close),
            Math.abs(candles[i].low - candles[i - 1].close)
          );
          atrSum += tr;
        }
        const atr = atrSum / (candles.length - 1);

        // Calculate EMAs
        const closes = candles.map(c => c.close);
        const ema9 = calculateEMA(closes, 9);
        const ema21 = calculateEMA(closes, 21);

        // 24h high/low
        const last24 = candles.slice(-24);
        const high24h = Math.max(...last24.map(c => c.high));
        const low24h = Math.min(...last24.map(c => c.low));

        // Sum volume
        const volume24h = last24.reduce((sum, c) => sum + c.volume * c.close, 0);

        symbolData.push({
          symbol,
          price: current.close,
          change1h: ((current.close - hourAgo) / hourAgo) * 100,
          change24h: ((current.close - dayAgo) / dayAgo) * 100,
          atrPercent: (atr / current.close) * 100,
          ema9: ema9[ema9.length - 1],
          ema21: ema21[ema21.length - 1],
          high24h,
          low24h,
          volume24h,
        });
      } catch {
        // Skip symbols that fail
      }
    }

    return {
      timestamp: new Date().toISOString(),
      symbols: symbolData,
    };
  } catch {
    return null;
  }
}

function calculateEMA(data: number[], period: number): number[] {
  const ema: number[] = [];
  const multiplier = 2 / (period + 1);

  let sum = 0;
  for (let i = 0; i < period && i < data.length; i++) {
    sum += data[i];
  }
  ema.push(sum / Math.min(period, data.length));

  for (let i = period; i < data.length; i++) {
    ema.push((data[i] - ema[ema.length - 1]) * multiplier + ema[ema.length - 1]);
  }

  return ema;
}

// ============ PARAMETER HISTORY TRACKING ============

interface ParamHistory {
  strategyId: string;
  params: Record<string, any>;
  testedAt: number;
  result: "success" | "failure" | "neutral";
  pnl?: number;
  notes?: string;
}

const PARAM_HISTORY_FILE = path.join(process.cwd(), "param_history.json");

function loadParamHistory(): ParamHistory[] {
  if (!fs.existsSync(PARAM_HISTORY_FILE)) return [];
  try {
    return JSON.parse(fs.readFileSync(PARAM_HISTORY_FILE, "utf-8"));
  } catch {
    return [];
  }
}

function saveParamHistory(history: ParamHistory[]): void {
  fs.writeFileSync(PARAM_HISTORY_FILE, JSON.stringify(history, null, 2));
}

function getTestedParams(strategyId: string): ParamHistory[] {
  return loadParamHistory().filter(p => p.strategyId === strategyId);
}

function formatParamHistoryForClaude(): string {
  const history = loadParamHistory();
  if (history.length === 0) return "No parameter experiments recorded yet.";

  const byStrategy = new Map<string, ParamHistory[]>();
  for (const h of history) {
    if (!byStrategy.has(h.strategyId)) byStrategy.set(h.strategyId, []);
    byStrategy.get(h.strategyId)!.push(h);
  }

  let output = "PARAMETER EXPERIMENT HISTORY:\n";
  for (const [strategyId, experiments] of byStrategy) {
    output += `\n${strategyId}:\n`;
    for (const exp of experiments.slice(-5)) { // Last 5 per strategy
      const status = exp.result === "success" ? "✅" : exp.result === "failure" ? "❌" : "➖";
      output += `  ${status} ${JSON.stringify(exp.params)} → ${exp.pnl?.toFixed(2) || "N/A"}%\n`;
    }
  }

  return output;
}

class QuantAgent {
  private state: AgentState;
  private executor: Executor | null = null;
  private isRunning = false;
  private claudeProcess: ChildProcess | null = null;

  constructor() {
    this.state = this.loadState();
    this.recoverFromStuckState();
  }

  private loadState(): AgentState {
    if (fs.existsSync(STATE_FILE)) {
      return JSON.parse(fs.readFileSync(STATE_FILE, "utf-8"));
    }
    return {
      mode: "idle",
      lastBacktest: 0,
      lastIteration: 0,
      iterationCount: 0,
      dailyPnL: 0,
      totalPnL: 0,
      startTime: Date.now(),
    };
  }

  private saveState(): void {
    fs.writeFileSync(STATE_FILE, JSON.stringify(this.state, null, 2));
  }

  // Recover from stuck states on startup
  private recoverFromStuckState(): void {
    if (this.state.mode === "iterate" || this.state.mode === "backtest") {
      console.log(`Recovering from stuck state: ${this.state.mode}`);
      this.state.mode = "idle";
      this.saveState();
    }
  }

  // Run backtests (DEPRECATED - Claude uses quick-backtest.ts for individual strategies)
  async runBacktests(): Promise<void> {
    console.log("Backtest skipped - using modular strategy system with quick-backtest.ts");
    this.state.lastBacktest = Date.now();
  }

  // Load iteration history for context
  private loadIterationHistory(): string {
    if (!fs.existsSync(RESULTS_DIR)) return "";

    const historyFiles = fs.readdirSync(RESULTS_DIR)
      .filter(f => f.match(/iteration_\d+_notes\.md/))
      .sort()
      .slice(-3);

    if (historyFiles.length === 0) return "";

    let history = "\n\n=== PREVIOUS ITERATION HISTORY ===\n";
    for (const file of historyFiles) {
      const content = fs.readFileSync(path.join(RESULTS_DIR, file), "utf-8");
      history += `\n--- ${file} ---\n${content.slice(0, 2000)}\n`;
    }
    return history;
  }

  // Load latest backtest results from top_strategies.json (small pre-computed file)
  private loadLatestResults(): string {
    const topStrategiesFile = path.join(process.cwd(), "top_strategies.json");

    if (!fs.existsSync(topStrategiesFile)) {
      return "No top_strategies.json found. Run backtest first.";
    }

    try {
      const data = JSON.parse(fs.readFileSync(topStrategiesFile, "utf-8"));
      const top10 = data.slice(0, 10);

      let summary = `Top 10 Strategies from top_strategies.json:\n`;
      for (const result of top10) {
        summary += `\n${result.strategyId}:
  - Symbol: ${result.symbol} @ ${result.interval}m
  - PnL: ${result.metrics?.totalPnLPercent?.toFixed(2) || 0}%
  - Win Rate: ${result.metrics?.winRate?.toFixed(1) || 0}%
  - Score: ${result.score?.toFixed(1) || 0}`;
      }
      return summary;
    } catch (e) {
      console.error("Error reading top_strategies.json:", e);
      return "Error reading top_strategies.json";
    }
  }

  // Build iteration prompt with RAW DATA - let Claude analyze everything
  private async buildIterationPrompt(): Promise<string> {
    const iterationHistory = this.loadIterationHistory();
    const backtestResults = this.loadLatestResults();
    const iteration = this.state.iterationCount;

    // Raw trade data - Claude analyzes
    const tradeAnalysis = analyzeTradeHistory();

    // Raw market data - Claude analyzes
    const marketData = await fetchMarketData();

    // Raw param history - Claude decides
    const paramHistory = loadParamHistory();

    return `
You are an autonomous quant trading agent. Your job is to research, develop, and optimize trading strategies for cryptocurrency on Revolut X.

PROJECT LOCATION: ${process.cwd()}

CURRENT ITERATION: ${iteration}

═══════════════════════════════════════════════════════════════════════
                         RAW TRADE DATA
═══════════════════════════════════════════════════════════════════════
${JSON.stringify(tradeAnalysis, null, 2)}

═══════════════════════════════════════════════════════════════════════
                       RAW MARKET DATA (BTC)
═══════════════════════════════════════════════════════════════════════
${marketData ? JSON.stringify(marketData, null, 2) : "Market data unavailable"}

═══════════════════════════════════════════════════════════════════════
                    PARAMETER EXPERIMENT HISTORY
═══════════════════════════════════════════════════════════════════════
${JSON.stringify(paramHistory.slice(-20), null, 2)}

═══════════════════════════════════════════════════════════════════════
                      BACKTEST RESULTS
═══════════════════════════════════════════════════════════════════════
${backtestResults}

═══════════════════════════════════════════════════════════════════════
                    PREVIOUS ITERATIONS
═══════════════════════════════════════════════════════════════════════
${iterationHistory}

YOUR MISSION:
1. ANALYZE the raw data above - you decide what's working and what's not
2. ANALYZE the market data - you decide if market is bullish/bearish/volatile
3. Based on YOUR analysis, decide what strategies to improve/add/disable
4. Create/improve strategies using the MODULAR SYSTEM below
5. Test strategies with quick-backtest on ANY symbol (not just BTC-USD)

=== MODULAR STRATEGY SYSTEM ===
Create strategies in these directories:
- src/strategies/momentum/
- src/strategies/mean-reversion/
- src/strategies/ml-features/
- src/strategies/composite/
- src/strategies/trend/

READ THESE FILES TO UNDERSTAND THE SYSTEM:
- Interface: src/strategies/_base/strategy-interface.ts
- Example: src/strategies/momentum/macd-divergence.ts
- Auto-loader: src/strategies/index.ts

WORKFLOW:
1. Read the interface and example to understand the pattern
2. Research creative trading ideas (WebSearch, think deeply)
3. Design and implement your strategy as a .ts file
4. Test on MULTIPLE symbols using the API:
   - Get liquid symbols: await api.getHighVolumeSymbols(1000000) in src/utils/revolut-api.ts
   - Or run batch tester: npx tsx src/batch-symbol-tester.ts 1
   - Test individually: npx tsx src/quick-backtest.ts <your-file> <SYMBOL> 15
5. If errors or poor results, fix and re-test
6. Passing strategies auto-register to winners.json (Sharpe > 0.5, winRate > 45%)

DYNAMIC SYMBOL DISCOVERY:
import * as api from "./utils/revolut-api.js";
const allSymbols = await api.getAllSymbols();         // All active USD pairs
const liquidSymbols = await api.getHighVolumeSymbols(1000000);  // $1M+ volume

AUTO-REGISTRATION:
quick-backtest.ts AUTOMATICALLY adds passing strategies to winners.json.
The executor loads and trades all strategies from winners.json.

YOU HAVE FULL AUTONOMY:
- Read any file
- Edit any code
- Run any command
- Research online
- Make trading decisions

Save your analysis to results/iteration_${iteration}_notes.md

BEGIN.
`;
  }

  // Spawn Claude Code to iterate and improve strategies
  async runIteration(): Promise<void> {
    console.log("\n" + "=".repeat(70));
    console.log("SPAWNING CLAUDE FOR STRATEGY ITERATION");
    console.log("=".repeat(70));

    this.state.mode = "iterate";
    this.state.iterationCount++;
    // FIX: Update lastIteration at START to prevent re-iteration if parent restarts
    this.state.lastIteration = Date.now();
    this.saveState();
    console.log(`  Iteration ${this.state.iterationCount} started at ${new Date().toISOString()}`);

    const prompt = await this.buildIterationPrompt();

    // Write prompt to temp file to avoid Windows command line limits
    const promptFile = path.join(process.cwd(), "temp_prompt.txt");
    fs.writeFileSync(promptFile, prompt, "utf-8");
    console.log(`Prompt written to temp file (${prompt.length} chars)`);

    return new Promise((resolve) => {
      console.log("  Spawning Claude CLI...");

      // Use stdin to pass prompt (avoids Windows command line length limit)
      this.claudeProcess = spawn("claude", [
        "--dangerously-skip-permissions",
        "--print",  // Print full conversation
      ], {
        cwd: process.cwd(),
        shell: true,
        stdio: ["pipe", "pipe", "pipe"],  // pipe stdin to send prompt
      });

      console.log("  Claude process started, PID:", this.claudeProcess.pid);

      // Send prompt via stdin (avoids Windows 8191 char command line limit)
      this.claudeProcess.stdin?.write(prompt);
      this.claudeProcess.stdin?.end();

      let outputBuffer = "";

      this.claudeProcess.stdout?.on("data", (data) => {
        const text = data.toString();
        outputBuffer += text;
        process.stdout.write(text);
      });

      this.claudeProcess.stderr?.on("data", (data) => {
        const text = data.toString();
        process.stderr.write(`[Claude stderr] ${text}`);
      });

      this.claudeProcess.on("close", (code) => {
        console.log(`\n${"=".repeat(70)}`);
        console.log(`Claude iteration ${this.state.iterationCount} completed with code ${code}`);
        const duration = ((Date.now() - this.state.lastIteration) / 60000).toFixed(1);
        console.log(`  Duration: ${duration} minutes`);
        console.log(`  Output length: ${outputBuffer.length} chars`);
        console.log("=".repeat(70));

        // Save Claude's output to file for debugging
        const outputFile = path.join(RESULTS_DIR, `claude_output_${this.state.iterationCount}.txt`);
        fs.writeFileSync(outputFile, outputBuffer);
        console.log(`  Output saved to: ${outputFile}`);

        this.state.mode = "idle";
        this.saveState();
        this.claudeProcess = null;
        resolve();
      });

      this.claudeProcess.on("error", (err) => {
        console.error("Claude spawn error:", err);
        this.state.mode = "idle";
        this.saveState();
        this.claudeProcess = null;
        resolve();
      });
    });
  }

  // Start live execution
  async startExecution(): Promise<void> {
    if (this.executor) {
      console.log("Executor already running");
      return;
    }

    console.log("\n" + "=".repeat(70));
    console.log("STARTING LIVE EXECUTION");
    console.log("=".repeat(70));

    this.state.mode = "execute";
    this.saveState();

    this.executor = new Executor({
      maxPositions: 10, // Allow more positions for diversification
      positionSizePercent: 5,
      stopLossPercent: 3,
      takeProfitPercent: 6,
      maxDailyLossPercent: 20,
      // tradingSymbols: [], // Dynamically populated from backtest results!
      interval: 5,
    });

    // Run executor in background
    this.executor.run().catch((error) => {
      console.error("Executor error:", error);
      this.executor = null;
    });
  }

  // Stop live execution
  stopExecution(): void {
    if (this.executor) {
      this.executor.stop();
      this.executor = null;
      this.state.mode = "idle";
      this.saveState();
    }
  }

  // Print current status
  printStatus(): void {
    const uptime = Date.now() - this.state.startTime;
    const uptimeHours = (uptime / (1000 * 60 * 60)).toFixed(1);

    console.log("\n--- Agent Status ---");
    console.log(`Mode: ${this.state.mode}`);
    console.log(`Uptime: ${uptimeHours} hours`);
    console.log(`Iterations: ${this.state.iterationCount}`);
    console.log(`Total PnL: $${this.state.totalPnL.toFixed(2)}`);

    if (this.executor) {
      const status = this.executor.getStatus() as any;
      console.log(`Positions: ${status.positions.length}`);
      console.log(`Daily PnL: $${status.dailyPnL.toFixed(2)}`);
    }
  }

  // Main control loop
  async run(): Promise<void> {
    this.isRunning = true;
    this.state.startTime = Date.now();
    this.saveState();

    console.log("\n" + "=".repeat(70));
    console.log("QUANT AGENT - AUTONOMOUS TRADING SYSTEM");
    console.log("=".repeat(70));
    console.log("\nStarting autonomous operation...");
    console.log("Using MODULAR STRATEGY SYSTEM (winners.json only)");
    console.log("Press Ctrl+C to stop\n");

    // Run initial iteration if no strategies exist
    const winnersPath = path.join(process.cwd(), "src", "strategies", "winners.json");
    if (fs.existsSync(winnersPath)) {
      const winners = JSON.parse(fs.readFileSync(winnersPath, "utf-8"));
      if (!winners.strategies || winners.strategies.length === 0) {
        console.log("No strategies in winners.json - running initial iteration...");
        await this.runIteration();
      }
    } else {
      console.log("No winners.json found - running initial iteration...");
      await this.runIteration();
    }

    // Start execution with whatever strategies are in winners.json
    await this.startExecution();

    // Main loop
    while (this.isRunning) {
      try {
        const now = Date.now();

        // Check if iteration is due (every 6 hours - more frequent for strategy development)
        if (now - this.state.lastIteration > SCHEDULE.iterationInterval) {
          console.log("\nScheduled iteration due...");
          this.stopExecution();
          await this.runIteration();
          await this.startExecution();  // Executor auto-reloads winners.json
        }

        // Print status periodically
        this.printStatus();

        // Wait before next check
        await new Promise((resolve) => setTimeout(resolve, SCHEDULE.statusLogInterval));
      } catch (error) {
        console.error("Control loop error:", error);
        // Ensure we're always in execute mode if possible
        if (!this.executor && this.state.mode !== "iterate" && this.state.mode !== "backtest") {
          await this.startExecution();
        }
        await new Promise((resolve) => setTimeout(resolve, 60000));
      }
    }
  }

  // Graceful shutdown
  stop(): void {
    console.log("\nShutting down agent...");
    this.isRunning = false;
    this.stopExecution();

    if (this.claudeProcess) {
      this.claudeProcess.kill();
      this.claudeProcess = null;
    }

    this.state.mode = "idle";
    this.saveState();
    console.log("Agent stopped");
  }
}

// CLI entry point
async function main() {
  const args = process.argv.slice(2);
  const command = args[0] || "run";

  const agent = new QuantAgent();

  // Handle graceful shutdown
  process.on("SIGINT", () => {
    agent.stop();
    process.exit(0);
  });

  process.on("SIGTERM", () => {
    agent.stop();
    process.exit(0);
  });

  switch (command) {
    case "run":
      await agent.run();
      break;

    case "backtest":
      await agent.runBacktests();
      break;

    case "iterate":
      await agent.runIteration();
      break;

    case "execute":
      await agent.startExecution();
      // Keep running
      await new Promise(() => {});
      break;

    case "status":
      agent.printStatus();
      break;

    default:
      console.log(`
Quant Agent - Autonomous Trading System

Usage: npx tsx src/index.ts [command]

Commands:
  run       - Start full autonomous operation (default)
  backtest  - Run backtest suite only
  iterate   - Run single Claude iteration only
  execute   - Start live execution only
  status    - Print current status
      `);
  }
}

main().catch(console.error);
