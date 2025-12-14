# QuantAgent - Autonomous AI Trading System

<div align="center">

![Version](https://img.shields.io/badge/version-1.0.0-blue.svg)
![Platform](https://img.shields.io/badge/platform-Revolut%20X-purple.svg)
![AI](https://img.shields.io/badge/AI-Claude%20Code-orange.svg)
![License](https://img.shields.io/badge/license-MIT-green.svg)

**A self-improving autonomous trading agent powered by Claude AI**

[Features](#features) • [Architecture](#architecture) • [Setup](#setup) • [Usage](#usage) • [Strategies](#strategies)

</div>

---

## Overview

QuantAgent is an autonomous cryptocurrency trading system that uses Claude AI to continuously research, develop, test, and optimize trading strategies. It trades on **Revolut X** exchange and self-improves through an iterative feedback loop.

```
┌─────────────────────────────────────────────────────────────────┐
│                      QUANT AGENT LOOP                           │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│   ┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐ │
│   │ RESEARCH │───▶│  CREATE  │───▶│BACKTEST  │───▶│  TRADE   │ │
│   │ (Claude) │    │STRATEGIES│    │& VALIDATE│    │  LIVE    │ │
│   └──────────┘    └──────────┘    └──────────┘    └──────────┘ │
│        ▲                                               │        │
│        │           ┌──────────────┐                    │        │
│        └───────────│   ANALYZE    │◀───────────────────┘        │
│                    │   RESULTS    │                             │
│                    └──────────────┘                             │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

## Features

### Autonomous Operation
- **Self-Improving**: Claude AI analyzes performance and creates new strategies
- **Iterative Learning**: Loss thresholds trigger automatic strategy optimization
- **24/7 Trading**: Runs continuously with built-in risk management

### Modular Strategy System
- **Hot-Swappable Strategies**: Add/remove strategies without restart
- **Multi-Timeframe**: Test strategies across 15m, 1h, 4h intervals
- **Auto-Registration**: Passing strategies automatically added to production

### Risk Management
- **Dynamic ATR-Based SL/TP**: Adapts to market volatility
- **Strategy-Type Profiles**: Different risk params for scalping vs trend
- **Loss Threshold Circuit Breaker**: Pauses trading and invokes Claude on losses
- **Position Limits**: Max positions and position sizing controls

### Technical Indicators
- RSI, MACD, Bollinger Bands, EMA, SMA
- ATR, ADX, Stochastic, CCI
- Volume analysis, VWAP
- Custom composite indicators

## Architecture

```
quant-agent/
├── src/
│   ├── index.ts              # Main orchestrator
│   ├── executor.ts           # Live trading executor
│   ├── iterator.ts           # Claude AI iteration loop
│   ├── backtester.ts         # Strategy backtesting engine
│   ├── quick-backtest.ts     # Fast single-strategy tester
│   ├── batch-symbol-tester.ts # Multi-symbol batch tester
│   │
│   ├── strategies/           # Modular strategy system
│   │   ├── _base/
│   │   │   └── strategy-interface.ts
│   │   ├── momentum/
│   │   │   ├── rsi-reversal.ts
│   │   │   ├── ema-crossover-momentum.ts
│   │   │   └── squeeze-momentum-breakout.ts
│   │   ├── mean-reversion/
│   │   │   └── vwap-mean-reversion.ts
│   │   ├── composite/
│   │   │   └── triple-confirmation-entry.ts
│   │   ├── winners.json      # Active strategies registry
│   │   └── index.ts          # Strategy auto-loader
│   │
│   ├── indicators/
│   │   └── index.ts          # Technical indicators library
│   │
│   └── utils/
│       └── revolut-api.ts    # Revolut X API wrapper
│
├── results/                  # Backtest results & iteration logs
└── package.json
```

## Setup

### Prerequisites
- Node.js 18+
- Revolut X account with API access
- Claude Code CLI installed

### Installation

```bash
# Clone the repository
git clone https://github.com/greenm8rix/QuantAgent-Claude-Revolutx-MCP.git
cd QuantAgent-Claude-Revolutx-MCP

# Install dependencies
npm install

# Configure environment
cp .env.example .env
# Edit .env with your API keys
```

### Environment Variables

Create a `.env` file:
```env
REVOLUT_X_API_KEY=your_api_key_here
REVOLUT_X_PRIVATE_KEY_PATH=/path/to/your/private.pem
```

## Usage

### Start Autonomous Trading

```bash
# Run the full autonomous system
npx tsx src/index.ts
```

This will:
1. Load winning strategies from `winners.json`
2. Start live execution
3. Monitor performance
4. Trigger Claude iterator on loss threshold

### Manual Operations

```bash
# Quick backtest a strategy
npx tsx src/quick-backtest.ts momentum/rsi-reversal.ts BTC-USD 15

# Batch test all strategies on all symbols
npx tsx src/batch-symbol-tester.ts

# Run backtester only
npx tsx src/backtester.ts

# Run single iteration
npx tsx src/iterator.ts 1
```

### Dashboard

```bash
# Start web dashboard (port 3000)
npx tsx src/dashboard.ts
```

## Strategies

### Strategy Interface

All strategies implement this interface:

```typescript
interface Strategy {
  id: string;
  name: string;
  description: string;

  initialize?(candles: Candle[]): Promise<void>;
  analyze(candles: Candle[]): Promise<Signal>;
}

type Signal = "buy" | "sell" | "hold";
```

### Creating a Strategy

```typescript
// src/strategies/momentum/my-strategy.ts
import type { Strategy, Signal } from "../_base/strategy-interface.js";
import * as ind from "../../indicators/index.js";

const strategy: Strategy = {
  id: "my-strategy-v1",
  name: "My Custom Strategy",
  description: "Description of what it does",

  async analyze(candles) {
    const rsi = ind.rsi(candles, 14);
    const lastRsi = rsi[rsi.length - 1];

    if (lastRsi < 30) return "buy";
    if (lastRsi > 70) return "sell";
    return "hold";
  }
};

export default strategy;
```

### Winners Registry

Strategies that pass backtesting are registered in `winners.json`:

```json
{
  "strategies": [
    {
      "file": "momentum/rsi-reversal.ts",
      "symbols": ["BTC-USD", "ETH-USD", "PEPE-USD"],
      "interval": 15,
      "notes": "83.3% WR, 2.73% PnL"
    }
  ]
}
```

## Risk Management

### Strategy-Type Risk Profiles

| Type | SL Range | TP Range | ATR Multiplier |
|------|----------|----------|----------------|
| Scalping | 0.5-2% | 0.8-3% | 1.0x / 1.5x |
| Trend | 2-8% | 4-20% | 2.0x / 4.0x |
| Mean Reversion | 1-4% | 1.5-6% | 1.5x / 2.0x |
| Momentum | 1.5-5% | 3-12% | 1.5x / 3.0x |
| Breakout | 1-4% | 3-15% | 1.2x / 3.5x |

### Loss Threshold

When daily losses exceed 13.5%, the system:
1. Pauses all new entries
2. Spawns Claude iterator
3. Analyzes what went wrong
4. Creates/modifies strategies
5. Resumes trading

## Performance Criteria

Strategies must pass these thresholds:

| Metric | Minimum |
|--------|---------|
| Trades | 5+ |
| Win Rate | 45%+ |
| Sharpe Ratio | 0.5+ |
| Total PnL | > 0% |

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-strategy`)
3. Commit your changes (`git commit -m 'Add amazing strategy'`)
4. Push to the branch (`git push origin feature/amazing-strategy`)
5. Open a Pull Request

## Disclaimer

**This software is for educational purposes only.**

- Cryptocurrency trading involves substantial risk of loss
- Past performance does not guarantee future results
- Never trade with money you cannot afford to lose
- This is not financial advice

## License

MIT License - see [LICENSE](LICENSE) for details.

---

<div align="center">

**Built with Claude AI + Revolut X**

</div>
