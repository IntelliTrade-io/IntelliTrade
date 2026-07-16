// Public Entry Assist DTOs — the ONLY Entry Assist shape that crosses the
// server/client boundary. Nothing here carries research configuration (variant
// names, thresholds, statistics, tiers, feature-flag values). The server-only
// rulebook and evaluator live under lib/server/entry-assist and never serialize
// their internals to this shape. See docs/intraday-currency-strength-entry-assist.md.

export type EntryAssistState = "watching" | "confirmed" | "fading";

export interface PublicEntryAssistCandidate {
  id: string; // stable rule id: "gbpusd-asia" | "gbpaud-asia" | "gbpjpy-ny-afternoon"
  symbol: string; // "GBP/USD"
  baseCode: string;
  quoteCode: string;
  direction: "bullish" | "bearish";
  state: EntryAssistState;
  sessionLabel: string; // "Asia session" | "New York afternoon"
  reasons: string[]; // safe whitelist strings only
  updatedAt: string; // ISO timestamp of the evaluated snapshot
}

export interface EntryAssistResponse {
  candidates: PublicEntryAssistCandidate[];
  dataStatus: "ok" | "stale" | "unavailable";
  evaluatedAt: string;
}
