import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { REASON_WHITELIST } from "./dto";

const INTRADAY_DIR = path.resolve(process.cwd(), "components/dashboardv2/panels/intraday");

function intradayFiles(): { name: string; text: string }[] {
  return fs
    .readdirSync(INTRADAY_DIR)
    .filter((f) => f.endsWith(".ts") || f.endsWith(".tsx"))
    .map((name) => ({ name, text: fs.readFileSync(path.join(INTRADAY_DIR, name), "utf8") }));
}

// Strip comments, imports, and property accesses so we scan only the customer
// text surface (string literals and JSX text), never identifiers like `.spread`.
function scannable(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/\/\/[^\n]*/g, " ")
    .replace(/^\s*import[\s\S]*?;$/gm, " ")
    .replace(/\.\w+/g, " ");
}

// From §0 of the build prompt. Internal server files/tests may use these; the
// customer-rendered intraday UI may not.
const FORBIDDEN = [
  "H1", "M15", "H4", "D1", "BEST", "STRICT", "gap_ema3", "gap20", "gap30",
  "persist2", "entry_gap", "threshold", "confirm_bars", "TP2.0", "SL1.0",
  "fixed target", "fixed stop", "sample size", "expectancy", "win rate",
  "stability score", "breakeven rate", "edge", "BOS", "ADX", "CHOP",
  "dual-currency move", "key TFs", "crossover", "backtested", "signal",
  "entry signal", "buy", "sell", "guaranteed", "high-probability",
];

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

describe("copy — intraday UI is customer safe", () => {
  const files = intradayFiles();

  it("has intraday source files to scan", () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it("contains no em dash character", () => {
    for (const { name, text } of files) {
      expect(text.includes("—"), `em dash in ${name}`).toBe(false);
    }
  });

  it("contains none of the forbidden research terms in customer text", () => {
    for (const { name, text } of files) {
      const scan = scannable(text);
      for (const term of FORBIDDEN) {
        const re = new RegExp(`\\b${escapeRe(term)}\\b`, "i");
        expect(re.test(scan), `forbidden term "${term}" in ${name}`).toBe(false);
      }
    }
  });

  it('never renders "Bullish / Bullish" or any doubled timeframe pair row', () => {
    for (const { name, text } of files) {
      expect(text.includes("Bullish / Bullish"), name).toBe(false);
      expect(text.includes("Bearish / Bearish"), name).toBe(false);
    }
  });

  it("does not import server-only Entry Assist internals into components", () => {
    for (const { name, text } of files) {
      expect(text.includes("lib/server/entry-assist"), name).toBe(false);
    }
  });
});

describe("copy — DTO reason whitelist", () => {
  it("contains only the approved phrases", () => {
    expect([...REASON_WHITELIST]).toEqual([
      "Momentum aligned",
      "Gap healthy",
      "Gap weakening",
      "Confirmation developing",
      "Pair alignment active",
      "Momentum easing",
      "Strong momentum confirmation",
    ]);
  });
});
