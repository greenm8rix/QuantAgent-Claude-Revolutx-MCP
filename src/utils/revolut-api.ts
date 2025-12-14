// Revolut X API Wrapper with Ed25519 Authentication
import * as ed from "@noble/ed25519";
import { sha512 } from "@noble/hashes/sha512";
import * as fs from "fs";

ed.etc.sha512Sync = (...m: Uint8Array[]) => sha512(ed.etc.concatBytes(...m));

const BASE_URL = "https://revx.revolut.com/api/1.0";
const API_KEY = process.env.REVOLUT_X_API_KEY || "";
const PRIVATE_KEY_PATH = process.env.REVOLUT_X_PRIVATE_KEY_PATH || "";

let privateKeyCache: Uint8Array | null = null;

function loadPrivateKey(): Uint8Array {
  if (privateKeyCache) return privateKeyCache;

  const pemContent = fs.readFileSync(PRIVATE_KEY_PATH, "utf-8");
  const base64Key = pemContent
    .replace("-----BEGIN PRIVATE KEY-----", "")
    .replace("-----END PRIVATE KEY-----", "")
    .replace(/\s/g, "");
  const derBytes = Buffer.from(base64Key, "base64");
  privateKeyCache = new Uint8Array(derBytes.slice(-32));
  return privateKeyCache;
}

async function signRequest(
  timestamp: string,
  method: string,
  path: string,
  query: string = "",
  body: string = ""
): Promise<string> {
  const privateKey = loadPrivateKey();
  const message = `${timestamp}${method}${path}${query}${body}`;
  const messageBytes = new TextEncoder().encode(message);
  const signature = await ed.signAsync(messageBytes, privateKey);
  return Buffer.from(signature).toString("base64");
}

export async function apiRequest(
  method: string,
  endpoint: string,
  query: Record<string, string | number> = {},
  body?: object
): Promise<any> {
  const timestamp = Date.now().toString();
  const apiPath = `/api/1.0${endpoint}`;

  const queryString = Object.entries(query)
    .filter(([_, v]) => v !== undefined && v !== "")
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
    .join("&");

  const bodyString = body ? JSON.stringify(body) : "";
  const signature = await signRequest(timestamp, method.toUpperCase(), apiPath, queryString, bodyString);

  const url = queryString
    ? `${BASE_URL}${endpoint}?${queryString}`
    : `${BASE_URL}${endpoint}`;

  const response = await fetch(url, {
    method,
    headers: {
      "Content-Type": "application/json",
      "Accept": "application/json",
      "X-Revx-API-Key": API_KEY,
      "X-Revx-Timestamp": timestamp,
      "X-Revx-Signature": signature,
    },
    body: body ? bodyString : undefined,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`API Error ${response.status}: ${errorText}`);
  }

  return response.json();
}

// API Methods
export async function getBalances() {
  return apiRequest("GET", "/balances");
}

export async function getCurrencies() {
  return apiRequest("GET", "/configuration/currencies");
}

export async function getTradingPairs(): Promise<Record<string, any>> {
  return apiRequest("GET", "/configuration/pairs");
}

export async function getAllSymbols(): Promise<string[]> {
  const pairs = await getTradingPairs();
  // Filter for USD pairs only (active ones)
  return Object.keys(pairs)
    .filter(pair => pair.endsWith("/USD") && pairs[pair].status === "active")
    .map(pair => pair.replace("/", "-")); // Convert BTC/USD to BTC-USD format
}

export async function getOrderBook(symbol: string, limit = 20) {
  const response = await apiRequest("GET", `/order-book/${symbol}`, { limit });

  // Normalize format to [[price, quantity], ...]
  const asks = response.data?.asks?.map((a: any) => [a.p, a.q]) || [];
  const bids = response.data?.bids?.map((b: any) => [b.p, b.q]) || [];

  return { asks, bids, timestamp: response.metadata?.timestamp };
}

export async function getCandles(symbol: string, interval = 60, limit = 500) {
  return apiRequest("GET", `/candles/${symbol}`, { interval, limit });
}

export async function getActiveOrders() {
  return apiRequest("GET", "/orders/active");
}

export async function getHistoricalOrders(startDate?: number, endDate?: number) {
  const query: Record<string, number> = {};
  if (startDate) query.start_date = startDate;
  if (endDate) query.end_date = endDate;
  return apiRequest("GET", "/orders/historical", query);
}

export async function placeOrder(
  clientOrderId: string,
  symbol: string,
  side: "buy" | "sell",
  orderType: "limit" | "market",
  options: {
    baseSize?: string;
    quoteSize?: string;
    price?: string;
    executionInstructions?: string[];
  }
) {
  const orderConfig: Record<string, any> = {};

  if (orderType === "limit") {
    orderConfig.limit = {
      price: options.price,
      ...(options.baseSize && { base_size: options.baseSize }),
      ...(options.quoteSize && { quote_size: options.quoteSize }),
      ...(options.executionInstructions && { execution_instructions: options.executionInstructions }),
    };
  } else {
    orderConfig.market = {
      ...(options.baseSize && { base_size: options.baseSize }),
      ...(options.quoteSize && { quote_size: options.quoteSize }),
    };
  }

  return apiRequest("POST", "/orders", {}, {
    client_order_id: clientOrderId,
    symbol,
    side,
    order_configuration: orderConfig,
  });
}

export async function cancelOrder(orderId: string) {
  return apiRequest("DELETE", `/orders/${orderId}`);
}

export async function getOrderById(orderId: string) {
  return apiRequest("GET", `/orders/${orderId}`);
}

export interface Candle {
  start: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export async function fetchHistoricalData(
  symbol: string,
  interval: number,
  limit = 500
): Promise<Candle[]> {
  const response = await getCandles(symbol, interval, limit);
  return response.data || [];
}

// Get high-volume symbols dynamically (minimum 24h volume in USD)
export async function getHighVolumeSymbols(minVolume24hUSD: number = 1000000): Promise<string[]> {
  const allSymbols = await getAllSymbols();
  const highVolumeSymbols: { symbol: string; volume: number }[] = [];

  console.log(`Scanning ${allSymbols.length} symbols for volume >= $${(minVolume24hUSD / 1000000).toFixed(1)}M...`);

  for (const symbol of allSymbols) {
    try {
      // Get 24h of 1h candles
      const candles = await fetchHistoricalData(symbol, 60, 24);
      if (candles.length < 12) continue;

      // Sum 24h volume in USD
      const volume24h = candles.reduce((sum, c) => sum + (c.volume * c.close), 0);

      if (volume24h >= minVolume24hUSD) {
        highVolumeSymbols.push({ symbol, volume: volume24h });
      }

      // Rate limit
      await new Promise(r => setTimeout(r, 200));
    } catch {
      // Skip failed symbols
    }
  }

  // Sort by volume descending
  highVolumeSymbols.sort((a, b) => b.volume - a.volume);

  console.log(`Found ${highVolumeSymbols.length} symbols with 24h volume >= $${(minVolume24hUSD / 1000000).toFixed(1)}M`);

  return highVolumeSymbols.map(s => s.symbol);
}
