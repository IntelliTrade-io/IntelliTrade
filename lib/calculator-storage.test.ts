import { describe, it, expect } from "vitest";
import {
  CALCULATOR_STORAGE_KEY,
  DEFAULT_CALCULATOR_STATE,
  clearCalculatorState,
  loadCalculatorState,
  saveCalculatorState,
  type StoredCalculatorState,
} from "./calculator-storage";

/** Minimal in-memory Storage double (vitest runs in node, no DOM). */
function fakeStorage(initial: Record<string, string> = {}): Storage {
  const map = new Map(Object.entries(initial));
  return {
    get length() {
      return map.size;
    },
    clear: () => map.clear(),
    getItem: (k: string) => map.get(k) ?? null,
    key: (i: number) => Array.from(map.keys())[i] ?? null,
    removeItem: (k: string) => void map.delete(k),
    setItem: (k: string, v: string) => void map.set(k, v),
  };
}

function throwingStorage(): Storage {
  const boom = () => {
    throw new Error("storage disabled");
  };
  return { length: 0, clear: boom, getItem: boom, key: boom, removeItem: boom, setItem: boom };
}

const sampleState: StoredCalculatorState = {
  ...DEFAULT_CALCULATOR_STATE,
  currency: "USD",
  pair: "XAUUSD",
  balance: "10000",
  riskPercent: "1",
  stopMode: "price",
  entryPrice: "3350",
  stopLossPrice: "3290",
  brokerSettingsOpen: true,
  brokerOverrides: { XAUUSD: { contractSize: "100", minLot: "0.01", lotStep: "0.01" } },
};

describe("calculator storage", () => {
  it("saves supported inputs and restores them after a simulated reload", () => {
    const storage = fakeStorage();
    saveCalculatorState(sampleState, storage);
    const restored = loadCalculatorState(storage);
    expect(restored).toEqual(sampleState);
  });

  it("does not save results or exchange rates (schema has no such fields)", () => {
    const storage = fakeStorage();
    saveCalculatorState(sampleState, storage);
    const raw = JSON.parse(storage.getItem(CALCULATOR_STORAGE_KEY)!);
    expect(Object.keys(raw)).not.toContain("result");
    expect(Object.keys(raw)).not.toContain("lots");
    expect(Object.keys(raw)).not.toContain("quoteToAccount");
    expect(Object.keys(raw)).not.toContain("rates");
  });

  it("returns null when nothing is stored", () => {
    expect(loadCalculatorState(fakeStorage())).toBeNull();
  });

  it("handles malformed storage gracefully", () => {
    const storage = fakeStorage({ [CALCULATOR_STORAGE_KEY]: "{not json" });
    expect(loadCalculatorState(storage)).toBeNull();
    expect(loadCalculatorState(fakeStorage({ [CALCULATOR_STORAGE_KEY]: '"a string"' }))).toBeNull();
  });

  it("rejects an older or unknown schema version", () => {
    const storage = fakeStorage({
      [CALCULATOR_STORAGE_KEY]: JSON.stringify({ ...sampleState, version: 0 }),
    });
    expect(loadCalculatorState(storage)).toBeNull();
  });

  it("sanitizes garbage fields back to defaults instead of restoring them", () => {
    const storage = fakeStorage({
      [CALCULATOR_STORAGE_KEY]: JSON.stringify({
        ...sampleState,
        currency: "not-a-currency",
        pair: "<script>",
        balance: "1e309", // Infinity
        riskPercent: "-3",
        stopMode: "teleport",
        brokerOverrides: { XAUUSD: { contractSize: "abc" }, "bad key!": { minLot: "0.01" } },
        selectedTemplateId: 42,
      }),
    });
    const restored = loadCalculatorState(storage)!;
    expect(restored.currency).toBe(DEFAULT_CALCULATOR_STATE.currency);
    expect(restored.pair).toBe(DEFAULT_CALCULATOR_STATE.pair);
    expect(restored.balance).toBe("");
    expect(restored.riskPercent).toBe("");
    expect(restored.stopMode).toBe("pips");
    expect(restored.brokerOverrides).toEqual({});
    expect(restored.selectedTemplateId).toBeNull();
  });

  it("keeps valid override entries and drops invalid ones", () => {
    const storage = fakeStorage({
      [CALCULATOR_STORAGE_KEY]: JSON.stringify({
        ...sampleState,
        brokerOverrides: {
          XAUUSD: { contractSize: "10", minLot: "0.01", lotStep: "0.01" },
          EURUSD: { contractSize: "" },
          BTCUSD: null,
        },
      }),
    });
    const restored = loadCalculatorState(storage)!;
    expect(restored.brokerOverrides).toEqual({
      XAUUSD: { contractSize: "10", minLot: "0.01", lotStep: "0.01" },
    });
  });

  it("reset clears persisted state", () => {
    const storage = fakeStorage();
    saveCalculatorState(sampleState, storage);
    clearCalculatorState(storage);
    expect(loadCalculatorState(storage)).toBeNull();
  });

  it("survives a storage that throws on every call", () => {
    const storage = throwingStorage();
    expect(() => saveCalculatorState(sampleState, storage)).not.toThrow();
    expect(loadCalculatorState(storage)).toBeNull();
    expect(() => clearCalculatorState(storage)).not.toThrow();
  });

  it("is SSR-safe: null storage (no window) is a no-op", () => {
    expect(loadCalculatorState(null)).toBeNull();
    expect(() => saveCalculatorState(sampleState, null)).not.toThrow();
    expect(() => clearCalculatorState(null)).not.toThrow();
  });
});
