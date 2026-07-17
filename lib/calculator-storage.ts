// Versioned local persistence for the free lot size calculator. Only raw
// INPUTS are stored, never calculated results or live exchange rates, so a
// restored session always recalculates against fresh conversion data.
//
// SSR-safe: every entry point takes an optional Storage (tests inject a fake;
// the browser default resolves lazily and returns null when unavailable, e.g.
// during server render or when Safari private mode throws on access).

export const CALCULATOR_STORAGE_KEY = "intellitrade:lot-size-calculator:v1";
export const CALCULATOR_STORAGE_VERSION = 1;

export type StopMode = "pips" | "price";

/** Per-instrument broker overrides, kept as the raw field strings the inputs hold. */
export interface StoredBrokerOverride {
  contractSize?: string;
  minLot?: string;
  lotStep?: string;
}

export interface StoredCalculatorState {
  version: typeof CALCULATOR_STORAGE_VERSION;
  currency: string;
  pair: string;
  balance: string;
  riskPercent: string;
  stopMode: StopMode;
  stopLossPips: string;
  entryPrice: string;
  stopLossPrice: string;
  brokerSettingsOpen: boolean;
  brokerOverrides: Record<string, StoredBrokerOverride>;
  /** Pro only: last-applied account template id, so the selection survives reloads. */
  selectedTemplateId: string | null;
}

export const DEFAULT_CALCULATOR_STATE: StoredCalculatorState = {
  version: CALCULATOR_STORAGE_VERSION,
  currency: "EUR",
  pair: "EURUSD",
  balance: "",
  riskPercent: "",
  stopMode: "pips",
  stopLossPips: "",
  entryPrice: "",
  stopLossPrice: "",
  brokerSettingsOpen: false,
  brokerOverrides: {},
  selectedTemplateId: null,
};

function resolveStorage(storage?: Storage | null): Storage | null {
  if (storage !== undefined) return storage;
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null; // storage access can throw (privacy modes, disabled storage)
  }
}

const isNumericField = (v: unknown): v is string =>
  typeof v === "string" && (v === "" || (v.length <= 24 && isFinite(Number(v)) && Number(v) >= 0));

const sanitizeNumericField = (v: unknown): string => (isNumericField(v) ? v : "");

function sanitizeOverrides(raw: unknown): Record<string, StoredBrokerOverride> {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return {};
  const out: Record<string, StoredBrokerOverride> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!/^[A-Z0-9]{3,12}$/.test(key)) continue;
    if (typeof value !== "object" || value === null) continue;
    const v = value as Record<string, unknown>;
    const entry: StoredBrokerOverride = {};
    if (isNumericField(v.contractSize) && v.contractSize !== "") entry.contractSize = v.contractSize;
    if (isNumericField(v.minLot) && v.minLot !== "") entry.minLot = v.minLot;
    if (isNumericField(v.lotStep) && v.lotStep !== "") entry.lotStep = v.lotStep;
    if (Object.keys(entry).length > 0) out[key] = entry;
    if (Object.keys(out).length >= 50) break;
  }
  return out;
}

/**
 * Load and sanitize the saved calculator state. Returns null when nothing
 * usable is stored: missing key, malformed JSON, unknown schema version, or
 * storage unavailable. Every field is validated; garbage falls back to the
 * default for that field rather than poisoning the calculator.
 */
export function loadCalculatorState(storage?: Storage | null): StoredCalculatorState | null {
  const store = resolveStorage(storage);
  if (!store) return null;
  let raw: string | null;
  try {
    raw = store.getItem(CALCULATOR_STORAGE_KEY);
  } catch {
    return null;
  }
  if (!raw) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null) return null;
  const p = parsed as Record<string, unknown>;
  if (p.version !== CALCULATOR_STORAGE_VERSION) return null;

  const d = DEFAULT_CALCULATOR_STATE;
  return {
    version: CALCULATOR_STORAGE_VERSION,
    currency: typeof p.currency === "string" && /^[A-Z]{3}$/.test(p.currency) ? p.currency : d.currency,
    pair: typeof p.pair === "string" && /^[A-Z0-9]{3,12}$/.test(p.pair) ? p.pair : d.pair,
    balance: sanitizeNumericField(p.balance),
    riskPercent: sanitizeNumericField(p.riskPercent),
    stopMode: p.stopMode === "price" ? "price" : "pips",
    stopLossPips: sanitizeNumericField(p.stopLossPips),
    entryPrice: sanitizeNumericField(p.entryPrice),
    stopLossPrice: sanitizeNumericField(p.stopLossPrice),
    brokerSettingsOpen: p.brokerSettingsOpen === true,
    brokerOverrides: sanitizeOverrides(p.brokerOverrides),
    selectedTemplateId:
      typeof p.selectedTemplateId === "string" && p.selectedTemplateId.length <= 64 ? p.selectedTemplateId : null,
  };
}

/** Persist the calculator inputs. Silently a no-op when storage is unavailable. */
export function saveCalculatorState(state: StoredCalculatorState, storage?: Storage | null): void {
  const store = resolveStorage(storage);
  if (!store) return;
  try {
    store.setItem(CALCULATOR_STORAGE_KEY, JSON.stringify({ ...state, version: CALCULATOR_STORAGE_VERSION }));
  } catch {
    // quota exceeded or storage disabled; losing persistence is acceptable
  }
}

/** Remove the saved state (the reset-to-defaults action). */
export function clearCalculatorState(storage?: Storage | null): void {
  const store = resolveStorage(storage);
  if (!store) return;
  try {
    store.removeItem(CALCULATOR_STORAGE_KEY);
  } catch {
    // ignore
  }
}
