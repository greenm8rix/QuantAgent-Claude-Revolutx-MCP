# QuantAgent - Autonomous AI Trading System

<div align="center">

![Version](https://img.shields.io/badge/version-2.0.0-blue.svg)
![Platform](https://img.shields.io/badge/platform-Revolut%20X-purple.svg)
![AI](https://img.shields.io/badge/AI-Claude%20Code-orange.svg)
![License](https://img.shields.io/badge/license-MIT-green.svg)

**A self-improving autonomous trading agent powered by Claude AI**

[Features](#features) • [System Flow](#system-flow) • [Architecture](#architecture) • [Setup](#setup) • [Usage](#usage) • [Strategies](#strategies)

</div>

---

## Overview

QuantAgent is an autonomous cryptocurrency trading system that uses Claude AI to continuously research, develop, test, and optimize trading strategies. It trades on **Revolut X** exchange and self-improves through a 6-hour iterative feedback loop.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         QUANT AGENT SYSTEM FLOW                             │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│   1. STARTUP                    2. CHECK STRATEGIES                         │
│   ┌──────────────┐              ┌──────────────────┐                        │
│   │  index.ts    │─────────────▶│ winners.json     │                        │
│   │  main()      │              │ has strategies?  │                        │
│   └──────────────┘              └────────┬─────────┘                        │
│                                     NO   │   YES                            │
│                                 ┌────────┴────────┐                         │
│                                 ▼                 ▼                         │
│   3. ITERATION              ┌──────────────────────────┐                    │
│   ┌──────────────┐          │  4. START EXECUTOR       │                    │
│   │ Spawn Claude │          │  ┌────────────────────┐  │                    │
│   │ - Analyze    │          │  │ Load winners.json  │  │                    │
│   │ - Research   │─────────▶│  │ Start trading loop │  │                    │
│   │ - Create     │          │  │ Check exits/entries│  │                    │
│   │ - Test       │          │  └────────────────────┘  │                    │
│   │ - Register   │          └──────────────────────────┘                    │
│   └──────────────┘                      │                                   │
│         ▲                               │                                   │
│         │         5. MAIN LOOP          ▼                                   │
│         │         ┌─────────────────────────────────┐                       │
│         │         │ Every 60 seconds:               │                       │
│         │         │ - Print status                  │                       │
│         │         │ - Check if 6 hours elapsed      │                       │
│         └─────────│ - If yes: stop executor,        │                       │
│                   │   run iteration, restart        │                       │
│                   └─────────────────────────────────┘                       │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Features

### Autonomous Operation
- **Self-Improving**: Claude AI analyzes performance and creates new strategies every 6 hours
- **Iterative Learning**: Loss thresholds (13.5%) trigger automatic strategy optimization
- **24/7 Trading**: Runs continuously with built-in crash recovery

### Modular Strategy System
- **Hot-Swappable Strategies**: Add/remove strategies via `winners.json`
- **Multi-Timeframe**: Test strategies across 15m, 1h, 4h intervals
- **Auto-Registration**: Claude adds passing strategies to production

### Risk Management
- **Dynamic ATR-Based SL/TP**: Adapts to market volatility per strategy type
- **Cooldown System**: 30-min pause after 2 consecutive stop losses
- **Position Limits**: Max 10 positions, 5% position sizing
- **Daily Loss Limit**: 20% max daily drawdown

---

## System Flow

### Complete Execution Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           STARTUP SEQUENCE                                  │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                        src/index.ts :: main()                               │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │  1. Parse CLI args (run | backtest | iterate | execute | status)      │  │
│  │  2. new QuantAgent()                                                  │  │
│  │     ├─ loadState() → Read agent_state.json                           │  │
│  │     └─ recoverFromStuckState() → Reset if mode=iterate/backtest      │  │
│  │  3. Register SIGINT/SIGTERM handlers                                  │  │
│  │  4. Execute command (default: "run")                                  │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                     QuantAgent::run() [Line 660]                            │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │  1. Check winners.json exists and has strategies                      │  │
│  │     ├─ NO strategies → runIteration() first                          │  │
│  │     └─ Has strategies → Continue                                      │  │
│  │  2. startExecution() → Launch Executor                                │  │
│  │  3. Enter MAIN LOOP (every 60 seconds)                                │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Main Control Loop

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    MAIN LOOP (Every 60 seconds)                             │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
              ┌─────────────────────┴─────────────────────┐
              ▼                                           ▼
┌───────────────────────────┐               ┌───────────────────────────┐
│ Check: 6 hours elapsed?   │               │     printStatus()         │
│ now - lastIteration >     │               │                           │
│ 21,600,000 ms             │               │  • Mode                   │
└───────────┬───────────────┘               │  • Uptime                 │
            │                               │  • Iterations             │
    YES     │                               │  • Total PnL              │
            ▼                               │  • Positions              │
┌───────────────────────────┐               │  • Daily PnL              │
│  stopExecution()          │               └───────────────────────────┘
│  runIteration()           │                           │
│  startExecution()         │                           │
└───────────────────────────┘                           │
            │                                           │
            └─────────────────┬─────────────────────────┘
                              │
                              ▼
                    ┌─────────────────────┐
                    │ await setTimeout    │
                    │ (60000 ms)          │
                    │ → Loop again        │
                    └─────────────────────┘
```

### Iteration Flow (Claude Strategy Development)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                QuantAgent::runIteration() [Line 520]                        │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
        ┌───────────────────────────┼───────────────────────────┐
        ▼                           ▼                           ▼
┌────────────────┐        ┌────────────────┐        ┌────────────────┐
│ Set mode =     │        │ iterationCount │        │ lastIteration  │
│ "iterate"      │        │ ++             │        │ = Date.now()   │
└────────────────┘        └────────────────┘        └────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                  buildIterationPrompt() [Line 423]                          │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │  COLLECTS DATA FOR CLAUDE:                                            │  │
│  │                                                                       │  │
│  │  loadIterationHistory()   → results/iteration_*_notes.md (last 3)    │  │
│  │  loadLatestResults()      → top_strategies.json (top 10)             │  │
│  │  analyzeTradeHistory()    → positions.json history                   │  │
│  │  fetchMarketData()        → API: Live prices for 10 symbols          │  │
│  │  loadParamHistory()       → param_history.json (last 20)             │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                    SPAWN CLAUDE CLI [Lines 543-597]                         │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │  spawn("claude", ["--dangerously-skip-permissions", "--print"])       │  │
│  │  stdin.write(prompt) → Send full prompt                               │  │
│  │  stdin.end()                                                          │  │
│  │                                                                       │  │
│  │  CLAUDE AUTONOMOUSLY:                                                 │  │
│  │    • Reads src/strategies/_base/strategy-interface.ts                │  │
│  │    • Analyzes trade history and market data                          │  │
│  │    • Creates/edits src/strategies/*.ts files                         │  │
│  │    • Tests with: npx tsx src/quick-backtest.ts <file> <symbol>       │  │
│  │    • Updates winners.json if strategy passes                         │  │
│  │    • Saves notes to results/iteration_N_notes.md                     │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
                    ┌───────────────────────────┐
                    │  on("close"):             │
                    │  • Save to claude_output_ │
                    │    N.txt                  │
                    │  • Set mode = "idle"      │
                    │  • saveState()            │
                    └───────────────────────────┘
```

### Executor Trading Loop

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                   Executor::run() [Line 906]                                │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
        ┌───────────────────────────┼───────────────────────────┐
        ▼                           ▼                           ▼
┌────────────────────┐    ┌────────────────────┐    ┌────────────────────┐
│ loadModularStrate- │    │ loadExistingState  │    │ getBalance()       │
│ gies() [L402]      │    │ () [L804]          │    │ [L466]             │
│                    │    │                    │    │                    │
│ Read winners.json  │    │ • getBalances()    │    │ API call or        │
│ For each entry:    │    │ • getActiveOrders  │    │ simulated          │
│  • import(file)    │    │                    │    │                    │
│  • Validate        │    └────────────────────┘    └────────────────────┘
│  • Store in Map    │
│  • Add symbols     │
└────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                  EXECUTOR LOOP (Every 5 minutes) [L931-968]                 │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                    ┌───────────────┴───────────────┐
                    ▼                               ▼
        ┌───────────────────────┐       ┌───────────────────────┐
        │   checkExits()        │       │   checkEntries()      │
        │   [Line 714]          │       │   [Line 763]          │
        │                       │       │                       │
        │ For each position:    │       │ For each symbol:      │
        │  • Get current price  │       │  • Skip if has pos    │
        │  • Check SL hit       │       │  • generateSignal()   │
        │  • Check TP hit       │       │  • If buy/sell:       │
        │  • Check signal exit  │       │    openPosition()     │
        └───────────────────────┘       └───────────────────────┘
                    │                               │
                    └───────────────┬───────────────┘
                                    ▼
                    ┌───────────────────────────┐
                    │ Check loss threshold      │
                    │ If < -13.5%:              │
                    │   invokeIterator()        │
                    └───────────────────────────┘
                                    │
                                    ▼
                    ┌───────────────────────────┐
                    │ await setTimeout          │
                    │ (5 * 60 * 1000)           │
                    │ → Loop again              │
                    └───────────────────────────┘
```

### Signal Generation & Position Management

```
┌─────────────────────────────────────────────────────────────────────────────┐
│               generateSignal(symbol) [Line 491]                             │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │  For each strategy in modularStrategies:                              │  │
│  │    if strategy.symbols.includes(symbol):                              │  │
│  │      • rateLimit() → 2s delay                                        │  │
│  │      • fetchHistoricalData(symbol, interval, 100)                    │  │
│  │      • strategy.analyze(candles) → Signal                            │  │
│  │      • if signal !== "hold" → return signal                          │  │
│  │  return "hold"                                                        │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│               openPosition(symbol, side, balance) [Line 536]                │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │  1. Check cooldown (skip if on cooldown)                              │  │
│  │  2. Get order book price                                              │  │
│  │  3. Validate price slippage (< 2%)                                   │  │
│  │  4. calculateDynamicSLTP(price, atr, strategyId)                     │  │
│  │     ├─ detectStrategyType() → scalping|trend|momentum|etc            │  │
│  │     ├─ Get RISK_PROFILES[strategyType]                               │  │
│  │     └─ Calculate SL/TP with ATR multipliers                          │  │
│  │  5. api.placeOrder()                                                  │  │
│  │  6. positions.set(symbol, position)                                   │  │
│  │  7. savePositions() → positions.json                                  │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│               closePosition(symbol, reason) [Line 663]                      │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │  1. Get exit price from order book                                    │  │
│  │  2. api.placeOrder() (opposite side)                                  │  │
│  │  3. Calculate PnL                                                      │  │
│  │  4. addToTradeHistory() → Track for Claude analysis                  │  │
│  │  5. Update cooldown if stop_loss                                      │  │
│  │  6. positions.delete(symbol)                                          │  │
│  │  7. savePositions()                                                    │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Architecture

### File Structure

```
quant-agent/
├── src/
│   ├── index.ts                 # MAIN ENTRY POINT - Orchestrator
│   │   ├── QuantAgent class     # Main controller
│   │   ├── loadTradeHistory()   # Read positions.json history
│   │   ├── analyzeTradeHistory()# Calculate win rates, failing strategies
│   │   ├── fetchMarketData()    # Get live prices for symbols
│   │   ├── loadParamHistory()   # Parameter experiment tracking
│   │   ├── buildIterationPrompt()# Build prompt for Claude
│   │   └── runIteration()       # Spawn Claude process
│   │
│   ├── executor.ts              # LIVE TRADING ENGINE
│   │   ├── Executor class       # Trading controller
│   │   ├── loadModularStrategies()# Load from winners.json
│   │   ├── generateSignal()     # Get buy/sell/hold from strategies
│   │   ├── openPosition()       # Enter trades with dynamic SL/TP
│   │   ├── closePosition()      # Exit trades, track history
│   │   ├── checkExits()         # Monitor SL/TP/signal reversals
│   │   ├── checkEntries()       # Scan for new entry signals
│   │   └── calculateDynamicSLTP()# ATR-based risk calculation
│   │
│   ├── quick-backtest.ts        # FAST STRATEGY TESTER
│   │   ├── runBacktest()        # Simulate strategy on candles
│   │   └── main()               # CLI: npx tsx quick-backtest.ts <file> <symbol> <interval>
│   │
│   ├── strategies/              # MODULAR STRATEGY SYSTEM
│   │   ├── _base/
│   │   │   └── strategy-interface.ts  # Strategy interface definition
│   │   │       ├── Strategy interface
│   │   │       ├── Signal type ("buy" | "sell" | "hold")
│   │   │       ├── RiskProfile interface
│   │   │       ├── BaseStrategy class
│   │   │       └── calculateSLTP() helper
│   │   │
│   │   ├── index.ts             # AUTO-LOADER
│   │   │   ├── loadAllStrategies()    # Scan directories
│   │   │   ├── getStrategy(id)        # Get by ID
│   │   │   └── listStrategyIds()      # List all
│   │   │
│   │   ├── winners.json         # ACTIVE STRATEGIES REGISTRY
│   │   │
│   │   ├── momentum/            # Momentum strategies
│   │   │   ├── rsi-reversal.ts
│   │   │   ├── ema-crossover-momentum.ts
│   │   │   ├── rsi-bb-volume-confluence.ts
│   │   │   ├── macd-divergence.ts
│   │   │   ├── squeeze-momentum-breakout.ts
│   │   │   ├── tsi-momentum.ts
│   │   │   ├── schaff-trend-cycle.ts
│   │   │   └── supertrend-follower.ts
│   │   │
│   │   ├── mean-reversion/      # Mean reversion strategies
│   │   │   └── volume-weighted-mean-reversion.ts
│   │   │
│   │   ├── trend/               # Trend following strategies
│   │   │   └── ichimoku-cloud-trend.ts
│   │   │
│   │   └── composite/           # Multi-indicator strategies
│   │       ├── multi-indicator-confluence.ts
│   │       └── market-structure-momentum.ts
│   │
│   ├── indicators/
│   │   └── index.ts             # Technical indicators library
│   │       ├── sma(), ema()
│   │       ├── rsi(), macd()
│   │       ├── bollingerBands()
│   │       ├── atr(), adx()
│   │       ├── stochastic(), cci()
│   │       └── vwap(), volume analysis
│   │
│   └── utils/
│       └── revolut-api.ts       # REVOLUT X API WRAPPER
│           ├── signRequest()          # Ed25519 authentication
│           ├── apiRequest()           # Authenticated API calls
│           ├── getBalances()          # GET /balances
│           ├── getOrderBook()         # GET /order-book/{symbol}
│           ├── getActiveOrders()      # GET /orders/active
│           ├── placeOrder()           # POST /orders
│           ├── cancelOrder()          # DELETE /orders/{id}
│           └── fetchHistoricalData()  # GET /candles/{symbol}
│
├── agent_state.json             # Persistent state (mode, iteration count)
├── positions.json               # Active positions & trade history
├── top_strategies.json          # Backtest results for reference
├── param_history.json           # Parameter experiment log
│
└── results/                     # Iteration outputs
    ├── claude_output_N.txt      # Raw Claude output
    └── iteration_N_notes.md     # Claude's analysis notes
```

### Data Flow

```
┌──────────────────┐     ┌──────────────────┐     ┌──────────────────┐
│  agent_state.json│     │  positions.json  │     │  winners.json    │
│                  │     │                  │     │                  │
│  • mode          │     │  • positions[]   │     │  • strategies[]  │
│  • lastIteration │     │  • history[]     │     │    • file        │
│  • iterationCount│     │  • dailyPnL      │     │    • symbols[]   │
│  • startTime     │     │  • updatedAt     │     │    • interval    │
└────────┬─────────┘     └────────┬─────────┘     └────────┬─────────┘
         │                        │                        │
         │ Read/Write             │ Read/Write             │ Read
         │ by index.ts            │ by executor.ts         │ by executor.ts
         │                        │                        │
         │                        │ Read by index.ts       │ Write by
         │                        │ (analyzeTradeHistory)  │ Claude iteration
         ▼                        ▼                        ▼

┌──────────────────┐     ┌──────────────────┐     ┌──────────────────┐
│top_strategies.   │     │ param_history.   │     │ results/*.txt    │
│json              │     │ json             │     │                  │
│                  │     │                  │     │  • claude_output │
│  • strategyId    │     │  • strategyId    │     │  • iteration_    │
│  • symbol        │     │  • params        │     │    notes.md      │
│  • metrics       │     │  • result        │     │                  │
└────────┬─────────┘     └────────┬─────────┘     └────────┬─────────┘
         │                        │                        │
         │ Read by index.ts       │ Read by index.ts       │ Write by
         │ (context for Claude)   │ (buildIterationPrompt) │ index.ts
```

---

## Setup

### Prerequisites
- Node.js 18+
- Revolut X account with API access
- Claude Code CLI installed (`npm install -g @anthropic-ai/claude-code`)

### Installation

```bash
# Clone the repository
git clone https://github.com/greenm8rix/QuantAgent-Claude-Revolutx-MCP.git
cd QuantAgent-Claude-Revolutx-MCP

# Install dependencies
npm install
```

### Configuration

Create environment variables or edit `src/utils/revolut-api.ts`:

```typescript
const API_KEY = "your_revolut_x_api_key";
const PRIVATE_KEY_PATH = "/path/to/your/private.pem";
```

Generate your private key for Revolut X:
```bash
openssl genpkey -algorithm ed25519 -out private.pem
openssl pkey -in private.pem -pubout -out public.pem
```

Upload `public.pem` to Revolut X API settings.

---

## Usage

### Start Autonomous Trading

```bash
# Run the full autonomous system (recommended)
npm run live
# or
npx tsx src/index.ts run
```

This will:
1. Load winning strategies from `winners.json`
2. Start the executor (live trading)
3. Monitor performance every 60 seconds
4. Run Claude iteration every 6 hours
5. Auto-recover from crashes

### Manual Operations

```bash
# Run single iteration only (Claude creates/improves strategies)
npx tsx src/index.ts iterate

# Start execution only (no iterations)
npx tsx src/index.ts execute

# Check current status
npx tsx src/index.ts status

# Quick backtest a strategy
npx tsx src/quick-backtest.ts momentum/rsi-reversal.ts BTC-USD 15

# Run executor standalone
npx tsx src/executor.ts
```

### Dashboard

```bash
# Start web dashboard (port 3001)
npx tsx src/dashboard.ts
```

---

## Strategies

### Strategy Interface

All strategies implement this interface:

```typescript
interface Strategy {
  id: string;                    // Unique identifier
  name: string;                  // Human-readable name
  description: string;           // What it does
  category: "momentum" | "mean_reversion" | "trend" | "scalping" | "composite";

  initialize?(candles: Candle[]): Promise<void>;  // Optional setup
  analyze(candles: Candle[]): Promise<Signal>;    // Main logic
  getMetadata(): StrategyMetadata;                // Metadata
  getRiskProfile(): RiskProfile;                  // Risk params
  getSuggestedSLTP(price, atr, side): SuggestedSLTP;
}

type Signal = "buy" | "sell" | "hold";
```

### Creating a Strategy

```typescript
// src/strategies/momentum/my-strategy.ts
import { BaseStrategy } from "../_base/strategy-interface.js";
import type { Signal } from "../_base/strategy-interface.js";
import type { Candle } from "../../indicators/index.js";
import * as ind from "../../indicators/index.js";

class MyStrategy extends BaseStrategy {
  id = "my-strategy-v1";
  name = "My Custom Strategy";
  description = "RSI oversold bounce strategy";
  category = "momentum" as const;

  async analyze(candles: Candle[]): Promise<Signal> {
    const rsi = ind.rsi(candles, 14);
    const lastRsi = rsi[rsi.length - 1];

    if (lastRsi < 30) return "buy";
    if (lastRsi > 70) return "sell";
    return "hold";
  }
}

export default new MyStrategy();
```

### Registering a Strategy

Add to `src/strategies/winners.json`:

```json
{
  "strategies": [
    {
      "file": "momentum/my-strategy.ts",
      "symbols": ["BTC-USD", "ETH-USD"],
      "interval": 15,
      "notes": "My strategy notes"
    }
  ]
}
```

### Testing a Strategy

```bash
npx tsx src/quick-backtest.ts momentum/my-strategy.ts BTC-USD 60
```

**Pass criteria:**
- 5+ trades
- 45%+ win rate
- 0.5+ Sharpe ratio
- Positive total PnL

---

## Risk Management

### Strategy-Type Risk Profiles

| Type | SL Range | TP Range | ATR Multiplier (SL/TP) |
|------|----------|----------|------------------------|
| Scalping | 0.5-2% | 0.8-3% | 1.0x / 1.5x |
| Trend | 2-8% | 4-20% | 2.0x / 4.0x |
| Mean Reversion | 1-4% | 1.5-6% | 1.5x / 2.0x |
| Momentum | 1.5-5% | 3-12% | 1.5x / 3.0x |
| Breakout | 1-4% | 3-15% | 1.2x / 3.5x |

### Cooldown System

After 2 consecutive stop losses on the same symbol+strategy:
- 30-minute trading pause
- Reset on next profitable trade

### Loss Threshold

When daily losses exceed 13.5%:
1. Pauses all new entries
2. Spawns Claude iterator (with 1-hour cooldown)
3. Claude analyzes what went wrong
4. Creates/modifies strategies
5. Resumes trading

### Position Limits

- Max positions: 10
- Position size: 5% of balance
- Daily loss limit: 20%

---

## API Reference

### Revolut X API Functions

```typescript
// Get account balances
getBalances(): Promise<Balance[]>

// Get order book
getOrderBook(symbol: string, limit?: number): Promise<OrderBook>

// Get historical candles
fetchHistoricalData(symbol: string, interval: number, limit?: number): Promise<Candle[]>

// Place order
placeOrder(clientOrderId, symbol, side, type, options): Promise<Order>

// Cancel order
cancelOrder(orderId: string): Promise<void>

// Get active orders
getActiveOrders(): Promise<Order[]>
```

---

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-strategy`)
3. Commit your changes (`git commit -m 'Add amazing strategy'`)
4. Push to the branch (`git push origin feature/amazing-strategy`)
5. Open a Pull Request

---

## Disclaimer

**This software is for educational purposes only.**

- Cryptocurrency trading involves substantial risk of loss
- Past performance does not guarantee future results
- Never trade with money you cannot afford to lose
- This is not financial advice

---

## License

MIT License - see [LICENSE](LICENSE) for details.

---

<div align="center">

**Built with Claude AI + Revolut X**

</div>
