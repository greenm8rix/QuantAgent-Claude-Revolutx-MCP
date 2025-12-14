// Claude Code Iterator - Spawns Claude with full permissions to self-improve strategies
import { spawn } from "child_process";
import * as fs from "fs";
import * as path from "path";
import { getPerformanceSummary } from "./trade-logger.js";

const PROJECT_ROOT = process.cwd();
const RESULTS_DIR = path.join(PROJECT_ROOT, "results");
const STRATEGIES_DIR = path.join(PROJECT_ROOT, "src", "strategies");

// Ensure directories exist
if (!fs.existsSync(RESULTS_DIR)) fs.mkdirSync(RESULTS_DIR, { recursive: true });
if (!fs.existsSync(STRATEGIES_DIR)) fs.mkdirSync(STRATEGIES_DIR, { recursive: true });

interface IterationResult {
  iteration: number;
  timestamp: string;
  claudeOutput: string;
  filesModified: string[];
  strategiesGenerated: number;
  backtestRan: boolean;
}

// Load previous iteration notes to give Claude context
function loadIterationHistory(): string {
  const historyFiles = fs.readdirSync(RESULTS_DIR)
    .filter(f => f.match(/iteration_\d+_notes\.md/))
    .sort()
    .slice(-3); // Last 3 iterations

  if (historyFiles.length === 0) return "";

  let history = "\n\n=== PREVIOUS ITERATION HISTORY ===\n";
  for (const file of historyFiles) {
    const content = fs.readFileSync(path.join(RESULTS_DIR, file), "utf-8");
    history += `\n--- ${file} ---\n${content.slice(0, 2000)}\n`;
  }
  return history;
}

// Build the prompt for Claude Code subprocess
function buildClaudePrompt(iteration: number, previousResults?: string): string {
  const iterationHistory = loadIterationHistory();

  const prompt = `
You are an autonomous quant trading agent. Your job is to research, develop, and optimize trading strategies for cryptocurrency on Revolut X.

PROJECT LOCATION: ${PROJECT_ROOT}

AVAILABLE TOOLS:
- Full file system access (read, write, edit any file)
- Execute any command (npm, npx tsx, etc.)
- Access to Revolut X API via the utils/revolut-api.ts module
- Technical indicators in src/indicators/index.ts

CURRENT ITERATION: ${iteration}

YOUR MISSION FOR THIS ITERATION:
1. ${iteration === 1 ? "Explore the codebase and understand the modular strategy system" : "Review the latest backtest results in results/ folder"}
2. Analyze what strategies are performing well and why
3. CREATE NEW MODULAR STRATEGIES in src/strategies/ directories (NOT strategy-lab.ts)
4. Quick-test strategies with: npx tsx src/quick-backtest.ts <strategy-file> <symbol> <interval>
5. Add new indicators if needed in src/indicators/index.ts
6. Analyze results and prepare for next iteration

=== MODULAR STRATEGY SYSTEM ===

Create strategies in these directories:
- src/strategies/momentum/
- src/strategies/mean-reversion/
- src/strategies/ml-features/
- src/strategies/composite/

READ THESE FILES TO UNDERSTAND THE SYSTEM:
- Interface: src/strategies/_base/strategy-interface.ts
- Example: src/strategies/momentum/macd-divergence.ts
- Auto-loader: src/strategies/index.ts

WORKFLOW:
1. Read the interface and example to understand the pattern
2. Research creative trading ideas (WebSearch, think deeply)
3. Design and implement your strategy
4. Test on MULTIPLE symbols:
   - Run batch tester: npx tsx src/batch-symbol-tester.ts  (tests ALL symbols)
   - Or test individually: npx tsx src/quick-backtest.ts <your-file> <SYMBOL> 15
5. If errors or poor results, fix and re-test
6. Passing strategies auto-register to winners.json (Sharpe > 0.5, winRate > 45%)

AUTO-REGISTRATION:
quick-backtest.ts AUTOMATICALLY adds passing strategies to winners.json.
You don't need to manually edit winners.json - just run quick-backtest on many symbols!
Each passing test adds that symbol to the strategy's entry in winners.json.

DYNAMIC SYMBOL DISCOVERY (USE THIS!):
You can query available trading pairs from the API:

// Get ALL active USD pairs (268+ symbols)
import * as api from "./utils/revolut-api.js";
const allSymbols = await api.getAllSymbols();  // Returns: ["BTC-USD", "ETH-USD", ...]

// Or run the batch tester to expand coverage automatically:
npx tsx src/batch-symbol-tester.ts  // Tests all strategies on ALL available symbols

DO NOT hardcode symbol lists - always use the API to get current pairs!

BE CREATIVE:
- Don't just combine indicators - think about WHY markets move
- Consider market microstructure, regime changes, volatility cycles
- Use the full power of TypeScript - classes, async, external data
- You have access to orderbook data, historical candles, all indicators

STRATEGY RESEARCH AREAS TO EXPLORE:
- Mean reversion with dynamic thresholds
- Momentum with volume confirmation
- Multi-timeframe analysis (combine signals from different intervals)
- Volatility breakouts (ATR-based)
- Support/resistance levels
- Order flow imbalance patterns
- Correlation-based pair trading
- Machine learning features (trend strength, momentum divergence)
- Adaptive parameters based on market regime
- Orderbook imbalance strategies
- VWAP/TWAP mean reversion
- Funding rate arbitrage patterns
- Whale movement detection
- Liquidation cascade prediction
- Cross-exchange spread analysis

CROSS-CURRENCY ARBITRAGE (NEW CAPABILITY):
- Run: npx tsx src/arbitrage-scanner.ts scan
- Scans for price discrepancies between USD and EUR pairs
- Example: BTC/USD vs BTC/EUR × EUR/USD rate
- If spread > fees (0.4%), there's profit opportunity
- Run: npx tsx src/arbitrage-scanner.ts triangular for full route analysis
- You can improve src/arbitrage-scanner.ts to find better opportunities

AVAILABLE SYMBOLS:
- 268 active USD pairs on Revolut X (fetched dynamically)
- 59 active EUR pairs for arbitrage opportunities
- Use getAllSymbols() from utils/revolut-api.ts to get full list

SAFETY RULES:
- NEVER delete working strategies - only ADD new ones
- Always backup strategy-lab.ts before major changes: cp src/strategy-lab.ts src/strategy-lab.backup.ts
- If backtest shows worse results, revert changes
- Keep at least 5 proven strategies active at all times

PROFIT TARGETS (AGGRESSIVE):
- Daily return target: 2-5% per day
- Monthly return target: 50-100%+
- Sharpe ratio: > 2.0 for strategies to be deployed
- Win rate: > 50%
- Profit factor: > 1.5
- Max drawdown: < 20% (auto-pause if exceeded)

CONSTRAINTS:
- Risk per trade: 5% of capital
- Only trade on Revolut X (use the existing API wrapper)
- Minimum 10 trades per backtest for statistical significance

${previousResults ? `BACKTEST RESULTS:\n${previousResults}` : "This is the first iteration - start by running a backtest to establish baseline."}

${getPerformanceSummary()}
${iterationHistory}

YOUR DECISION:
1. If current strategies are meeting targets (>2% daily, Sharpe >2), you may skip modifications
2. If strategies are underperforming, research and implement improvements
3. If you have new ideas to test, create them even if current ones work

CAPABILITIES:
- You CAN edit any file: src/strategy-lab.ts, src/indicators/index.ts, src/strategies/*
- You CAN run commands: npx tsx src/backtester.ts, npm run build
- You CAN create new strategy files
- You CAN research online for new trading strategies
- You CAN skip modifications if you determine current strategies are optimal

ALWAYS save your analysis to results/iteration_${iteration}_notes.md including:
- Current performance assessment
- Decision: modify or keep current strategies
- If modified: what you changed and why
- Ideas for future iterations
- This file will be read by future iterations so you remember your progress

BEGIN YOUR AUTONOMOUS RESEARCH.
`;

  return prompt;
}

// Spawn Claude Code as subprocess with full permissions
function spawnClaude(prompt: string): Promise<string> {
  return new Promise((resolve, reject) => {
    console.log("\n" + "=".repeat(80));
    console.log("SPAWNING CLAUDE CODE SUBPROCESS");
    console.log("=".repeat(80) + "\n");

    // Write prompt to temp file to avoid Windows command line length limits
    const promptFile = path.join(PROJECT_ROOT, "temp_prompt.txt");
    fs.writeFileSync(promptFile, prompt, "utf-8");
    console.log(`Prompt written to: ${promptFile} (${prompt.length} chars)`);

    // Use stdin to pass prompt instead of -p argument
    const claude = spawn("claude", ["--dangerously-skip-permissions"], {
      cwd: PROJECT_ROOT,
      shell: true,
      stdio: ["pipe", "pipe", "pipe"],
      env: {
        ...process.env,
        REVOLUT_X_API_KEY: process.env.REVOLUT_X_API_KEY,
        REVOLUT_X_PRIVATE_KEY_PATH: process.env.REVOLUT_X_PRIVATE_KEY_PATH,
      },
    });

    // Send prompt via stdin
    claude.stdin.write(prompt);
    claude.stdin.end();

    let output = "";
    let errorOutput = "";

    claude.stdout.on("data", (data) => {
      const text = data.toString();
      output += text;
      process.stdout.write(text); // Stream to console
    });

    claude.stderr.on("data", (data) => {
      const text = data.toString();
      errorOutput += text;
      process.stderr.write(text);
    });

    claude.on("close", (code) => {
      console.log(`\nClaude subprocess exited with code ${code}`);
      if (code === 0 || output.length > 0) {
        resolve(output);
      } else {
        reject(new Error(`Claude failed: ${errorOutput}`));
      }
    });

    claude.on("error", (err) => {
      reject(err);
    });
  });
}

// Get list of modified files since last iteration
function getModifiedFiles(): string[] {
  const modified: string[] = [];

  // Check key files
  const filesToCheck = [
    "src/strategy-lab.ts",
    "src/indicators/index.ts",
    "src/backtester.ts",
    ...fs.readdirSync(STRATEGIES_DIR).map(f => path.join("src/strategies", f)),
  ];

  for (const file of filesToCheck) {
    const fullPath = path.join(PROJECT_ROOT, file);
    if (fs.existsSync(fullPath)) {
      const stats = fs.statSync(fullPath);
      // Consider modified if changed in last 10 minutes
      if (Date.now() - stats.mtimeMs < 10 * 60 * 1000) {
        modified.push(file);
      }
    }
  }

  return modified;
}

// Load latest backtest results
function loadLatestResults(): string | undefined {
  // Read from pre-computed top_strategies.json (small file, ~36KB)
  // NOT from huge backtest files (700MB+)
  const topStrategiesFile = path.join(PROJECT_ROOT, "top_strategies.json");

  if (!fs.existsSync(topStrategiesFile)) return undefined;

  try {
    const data = JSON.parse(fs.readFileSync(topStrategiesFile, "utf-8"));
    const top10 = data.slice(0, 10);

    let summary = `Top 10 Strategies from top_strategies.json:\n`;
    for (const result of top10) {
      summary += `\n${result.strategyId}:
  - Symbol: ${result.symbol} @ ${result.interval}m
  - Trades: ${result.metrics?.totalTrades || 0}
  - Win Rate: ${result.metrics?.winRate?.toFixed(1) || 0}%
  - PnL: ${result.metrics?.totalPnLPercent?.toFixed(2) || 0}%
  - Sharpe: ${result.metrics?.sharpeRatio?.toFixed(2) || 0}
  - Max DD: ${result.metrics?.maxDrawdownPercent?.toFixed(1) || 0}%
  - Profit Factor: ${result.metrics?.profitFactor?.toFixed(2) || 0}`;
    }
    return summary;
  } catch (e) {
    console.error("Error reading top_strategies.json:", e);
    return undefined;
  }
}

// Run single iteration
async function runIteration(iteration: number): Promise<IterationResult> {
  console.log(`\n${"#".repeat(80)}`);
  console.log(`# ITERATION ${iteration}`);
  console.log(`${"#".repeat(80)}\n`);

  const timestamp = new Date().toISOString();
  const previousResults = loadLatestResults();
  const prompt = buildClaudePrompt(iteration, previousResults);

  console.log("Prompt length:", prompt.length, "chars");
  console.log("Previous results available:", !!previousResults);

  const claudeOutput = await spawnClaude(prompt);
  const filesModified = getModifiedFiles();

  // Count new strategies
  const strategyFiles = fs.existsSync(STRATEGIES_DIR)
    ? fs.readdirSync(STRATEGIES_DIR).length
    : 0;

  // Check if backtest was run
  const backtestRan = claudeOutput.includes("backtest") || claudeOutput.includes("Backtest");

  const result: IterationResult = {
    iteration,
    timestamp,
    claudeOutput,
    filesModified,
    strategiesGenerated: strategyFiles,
    backtestRan,
  };

  // Save iteration log
  const logPath = path.join(RESULTS_DIR, `iteration_${iteration}_log.json`);
  fs.writeFileSync(logPath, JSON.stringify(result, null, 2));

  return result;
}

// Main iteration loop
export async function runIterationLoop(maxIterations = 100, delayBetweenMs = 5000): Promise<void> {
  console.log("=".repeat(80));
  console.log("QUANT AGENT ITERATOR - AUTONOMOUS STRATEGY OPTIMIZATION");
  console.log("=".repeat(80));
  console.log(`\nMax iterations: ${maxIterations}`);
  console.log(`Delay between iterations: ${delayBetweenMs}ms`);
  console.log(`Project root: ${PROJECT_ROOT}\n`);

  for (let i = 1; i <= maxIterations; i++) {
    try {
      const result = await runIteration(i);

      console.log(`\n--- Iteration ${i} Summary ---`);
      console.log(`Files modified: ${result.filesModified.join(", ") || "none"}`);
      console.log(`Strategies generated: ${result.strategiesGenerated}`);
      console.log(`Backtest ran: ${result.backtestRan}`);

      // Wait between iterations to avoid rate limits
      if (i < maxIterations) {
        console.log(`\nWaiting ${delayBetweenMs / 1000}s before next iteration...`);
        await new Promise(resolve => setTimeout(resolve, delayBetweenMs));
      }
    } catch (error) {
      console.error(`\nIteration ${i} failed:`, error);
      // Continue to next iteration after a longer delay
      await new Promise(resolve => setTimeout(resolve, 30000));
    }
  }

  console.log("\n" + "=".repeat(80));
  console.log("ITERATION LOOP COMPLETE");
  console.log("=".repeat(80));
}

// CLI entry point
const isMainIterator = process.argv[1]?.includes("iterator");
if (isMainIterator) {
  const maxIterations = parseInt(process.argv[2] || "10", 10);
  runIterationLoop(maxIterations).catch(console.error);
}
