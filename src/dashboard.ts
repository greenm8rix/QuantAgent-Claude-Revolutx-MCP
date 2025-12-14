// Live Trading Dashboard - Web UI
import * as http from "http";
import * as fs from "fs";
import * as path from "path";

const PORT = 3001;
const POSITIONS_FILE = path.join(process.cwd(), "positions.json");
const RESULTS_DIR = path.join(process.cwd(), "results");
const TOP_STRATEGIES_FILE = path.join(process.cwd(), "top_strategies.json");

interface PositionsData {
  positions: any[];
  dailyPnL: number;
  startingBalance: number;
  updatedAt: number;
}

function getPositionsData(): PositionsData {
  try {
    if (fs.existsSync(POSITIONS_FILE)) {
      const data = JSON.parse(fs.readFileSync(POSITIONS_FILE, "utf-8"));
      if (Array.isArray(data)) {
        return { positions: data, dailyPnL: 0, startingBalance: 100, updatedAt: Date.now() };
      }
      return {
        positions: data.positions || [],
        dailyPnL: data.dailyPnL || 0,
        startingBalance: data.startingBalance || 100,
        updatedAt: data.updatedAt || Date.now()
      };
    }
  } catch {}
  return { positions: [], dailyPnL: 0, startingBalance: 100, updatedAt: Date.now() };
}

function getTopStrategies(): any[] {
  try {
    // Read from pre-computed top strategies file (written by executor)
    if (fs.existsSync(TOP_STRATEGIES_FILE)) {
      const data = JSON.parse(fs.readFileSync(TOP_STRATEGIES_FILE, "utf-8"));
      return data.slice(0, 15); // Top 15 for display
    }
  } catch (e) {
    console.error("Error loading strategies:", e);
  }
  return [];
}

function generateHTML(): string {
  const data = getPositionsData();
  const positions = data.positions;
  const topStrategies = getTopStrategies();

  const dailyPnL = data.dailyPnL;
  const dailyPnLPercent = (dailyPnL / data.startingBalance) * 100;
  const openCount = positions.filter(p => !p.closedAt).length;

  const positionsHTML = positions
    .filter(p => !p.closedAt)  // Show open positions only
    .map(p => {
      const pnlClass = (p.unrealizedPnl || 0) >= 0 ? "profit" : "loss";
      const pnlVal = p.unrealizedPnl || 0;
      return `
        <tr>
          <td><strong>${p.symbol}</strong></td>
          <td class="${p.side === 'long' ? 'profit' : 'loss'}">${p.side?.toUpperCase() || "LONG"}</td>
          <td>$${p.entryPrice?.toFixed(6) || "0"}</td>
          <td>${p.quantity?.toFixed(4) || "0"}</td>
          <td>${p.strategyId || "-"}</td>
          <td>SL: $${p.stopLoss?.toFixed(4) || "-"}</td>
          <td>TP: $${p.takeProfit?.toFixed(4) || "-"}</td>
        </tr>
      `;
    }).join("");

  const strategiesHTML = topStrategies.map((s, i) => `
    <tr>
      <td>${i + 1}</td>
      <td><strong>${s.symbol}</strong></td>
      <td>${s.strategyId}</td>
      <td>${s.interval}m</td>
      <td class="profit">+${s.metrics?.totalPnLPercent?.toFixed(2) || 0}%</td>
      <td>${s.metrics?.winRate?.toFixed(0) || 0}%</td>
      <td style="color: #00aaff;">${s.score?.toFixed(1) || 0}</td>
    </tr>
  `).join("");

  return `
<!DOCTYPE html>
<html>
<head>
  <title>Quant Agent Dashboard</title>
  <meta http-equiv="refresh" content="10">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: 'Segoe UI', Tahoma, sans-serif;
      background: #0a0a0f;
      color: #e0e0e0;
      padding: 20px;
    }
    h1 { color: #00ff88; margin-bottom: 10px; }
    h2 { color: #888; margin: 20px 0 10px; font-size: 14px; text-transform: uppercase; }
    .stats {
      display: flex;
      gap: 20px;
      margin: 20px 0;
    }
    .stat-box {
      background: #1a1a2e;
      padding: 20px 30px;
      border-radius: 10px;
      border: 1px solid #333;
    }
    .stat-box .label { color: #888; font-size: 12px; }
    .stat-box .value { font-size: 28px; font-weight: bold; margin-top: 5px; }
    .profit { color: #00ff88; }
    .loss { color: #ff4444; }
    table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 10px;
      background: #1a1a2e;
      border-radius: 10px;
      overflow: hidden;
    }
    th, td {
      padding: 12px 15px;
      text-align: left;
      border-bottom: 1px solid #333;
    }
    th {
      background: #252540;
      color: #888;
      font-size: 11px;
      text-transform: uppercase;
    }
    tr:hover { background: #252540; }
    .live-dot {
      display: inline-block;
      width: 8px;
      height: 8px;
      background: #00ff88;
      border-radius: 50%;
      margin-right: 8px;
      animation: pulse 2s infinite;
    }
    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.3; }
    }
    .timestamp { color: #666; font-size: 12px; margin-top: 20px; }
  </style>
</head>
<body>
  <h1><span class="live-dot"></span>Quant Agent Live Dashboard</h1>

  <div class="stats">
    <div class="stat-box">
      <div class="label">Open Positions</div>
      <div class="value">${openCount}</div>
    </div>
    <div class="stat-box">
      <div class="label">Daily PnL</div>
      <div class="value ${dailyPnL >= 0 ? 'profit' : 'loss'}">${dailyPnL >= 0 ? '+' : ''}$${dailyPnL.toFixed(2)} (${dailyPnLPercent >= 0 ? '+' : ''}${dailyPnLPercent.toFixed(2)}%)</div>
    </div>
    <div class="stat-box">
      <div class="label">Trading Symbols</div>
      <div class="value">50</div>
    </div>
    <div class="stat-box">
      <div class="label">Mode</div>
      <div class="value" style="color: #ffaa00;">SIMULATED</div>
    </div>
  </div>

  <h2>Open Positions</h2>
  <table>
    <thead>
      <tr>
        <th>Symbol</th>
        <th>Side</th>
        <th>Entry Price</th>
        <th>Quantity</th>
        <th>Strategy</th>
        <th>Stop Loss</th>
        <th>Take Profit</th>
      </tr>
    </thead>
    <tbody>
      ${positionsHTML || '<tr><td colspan="7" style="text-align:center;color:#666;">No open positions</td></tr>'}
    </tbody>
  </table>

  <h2>Top Strategies (by PnL + Win Rate)</h2>
  <table>
    <thead>
      <tr>
        <th>#</th>
        <th>Symbol</th>
        <th>Strategy</th>
        <th>Interval</th>
        <th>PnL</th>
        <th>Win Rate</th>
        <th>Score</th>
      </tr>
    </thead>
    <tbody>
      ${strategiesHTML || '<tr><td colspan="7" style="text-align:center;color:#666;">No strategies loaded</td></tr>'}
    </tbody>
  </table>

  <div class="timestamp">Last updated: ${new Date().toLocaleString()} (auto-refreshes every 10s)</div>
</body>
</html>
  `;
}

const server = http.createServer((req, res) => {
  if (req.url === "/" || req.url === "/dashboard") {
    res.writeHead(200, { "Content-Type": "text/html" });
    res.end(generateHTML());
  } else if (req.url === "/api/positions") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(getPositionsData()));
  } else if (req.url === "/api/strategies") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(getTopStrategies()));
  } else {
    res.writeHead(404);
    res.end("Not found");
  }
});

server.listen(PORT, () => {
  console.log(`\n========================================`);
  console.log(`  QUANT AGENT DASHBOARD`);
  console.log(`  Open: http://localhost:${PORT}`);
  console.log(`========================================\n`);
});
