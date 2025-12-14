// Strategy Auto-Loader
// Automatically discovers and loads strategies from subdirectories

import { readdirSync, statSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import type { Strategy } from "./_base/strategy-interface.js";

// Get current directory for ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Allowed strategy directories (Claude can only create in these)
const STRATEGY_DIRS = [
  "momentum",
  "mean-reversion",
  "ml-features",
  "composite",
  "trend", // Legacy support
];

// Strategy registry
const strategyRegistry: Map<string, Strategy> = new Map();

// Load a single strategy file
async function loadStrategyFile(filePath: string): Promise<Strategy | null> {
  try {
    const module = await import(filePath);
    const strategy = module.default as Strategy;

    if (strategy && strategy.id && typeof strategy.analyze === "function") {
      console.log(`  Loaded strategy: ${strategy.id} (${strategy.name})`);
      return strategy;
    }

    console.log(`  Skipped ${filePath}: Missing id or analyze function`);
    return null;
  } catch (error: any) {
    console.error(`  Error loading ${filePath}: ${error.message}`);
    return null;
  }
}

// Load all strategies from a directory
async function loadStrategiesFromDir(dirName: string): Promise<void> {
  const dirPath = join(__dirname, dirName);

  if (!existsSync(dirPath) || !statSync(dirPath).isDirectory()) {
    return;
  }

  const files = readdirSync(dirPath);

  for (const file of files) {
    // Skip non-JS/TS files and index files
    if (!file.endsWith(".ts") && !file.endsWith(".js")) continue;
    if (file === "index.ts" || file === "index.js") continue;

    const filePath = join(dirPath, file);

    // Skip directories
    if (statSync(filePath).isDirectory()) continue;

    const strategy = await loadStrategyFile(filePath);
    if (strategy) {
      strategyRegistry.set(strategy.id, strategy);
    }
  }
}

// Load all strategies from all directories
export async function loadAllStrategies(): Promise<Map<string, Strategy>> {
  console.log("\n=== Loading Modular Strategies ===\n");

  for (const dir of STRATEGY_DIRS) {
    console.log(`Scanning ${dir}/...`);
    await loadStrategiesFromDir(dir);
  }

  console.log(`\nLoaded ${strategyRegistry.size} modular strategies\n`);
  return strategyRegistry;
}

// Get a specific strategy by ID
export function getStrategy(id: string): Strategy | undefined {
  return strategyRegistry.get(id);
}

// Get all loaded strategies
export function getAllStrategies(): Map<string, Strategy> {
  return strategyRegistry;
}

// List all strategy IDs
export function listStrategyIds(): string[] {
  return Array.from(strategyRegistry.keys());
}

// Get strategies by category
export function getStrategiesByCategory(category: string): Strategy[] {
  return Array.from(strategyRegistry.values()).filter(s => s.category === category);
}

// Export types
export type { Strategy, Signal, RiskProfile, StrategyMetadata, SuggestedSLTP } from "./_base/strategy-interface.js";
export { BaseStrategy, DEFAULT_RISK_PROFILES, calculateSLTP } from "./_base/strategy-interface.js";
