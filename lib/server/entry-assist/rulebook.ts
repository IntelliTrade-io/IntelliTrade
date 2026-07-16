// Entry Assist rulebook — SERVER ONLY. This module and its internal stats are
// never serialized to clients; only the projected PublicEntryAssistCandidate DTO
// crosses the boundary (see dto.ts). Research terminology is allowed here.
//
// Counts are locked at 3 Tier 1 / 9 Tier 2 / 5 Watchlist (the guidebook's 17/7
// figures are outdated). Under default flags only the three Tier 1 rules are
// customer-eligible. Watchlist rules can NEVER reach a customer, even with their
// flag enabled.

import { sessionCustomerLabel, type SessionId } from "./sessions";

export type Tier = "tier1" | "tier2" | "watchlist";

export type VariantId =
  | "BEST_ema3_gap20_persist2_align"
  | "STRICT_ema3_gap30_persist2_align";

export interface VariantConfig {
  gapSource: "gap_ema3";
  entryGap: number; // internal level L
  confirmBars: number; // persist2
  requirePairAlignment: boolean;
  requireDualCurrencyMove: boolean;
}

export const VARIANTS: Record<VariantId, VariantConfig> = {
  BEST_ema3_gap20_persist2_align: {
    gapSource: "gap_ema3",
    entryGap: 20,
    confirmBars: 2,
    requirePairAlignment: true,
    requireDualCurrencyMove: false,
  },
  STRICT_ema3_gap30_persist2_align: {
    gapSource: "gap_ema3",
    entryGap: 30,
    confirmBars: 2,
    requirePairAlignment: true,
    requireDualCurrencyMove: false,
  },
};

export interface EntryAssistRule {
  id: string;
  tier: Tier;
  symbol: string; // e.g. "GBPUSD"
  session: SessionId;
  variant: VariantId;
  enabledByDefault: boolean;
  featureFlag: "primary" | "secondary" | "watchlist";
  internal: {
    horizon: number;
    model: string; // "TP2.0/SL1.0" etc.
    n: number;
    expectancyR: number;
    winRate: number;
    breakevenRate?: number;
    edge: number;
    stability?: number;
  };
  customer: { sessionLabel: string };
}

function rule(
  id: string,
  tier: Tier,
  symbol: string,
  session: SessionId,
  variant: VariantId,
  internal: EntryAssistRule["internal"],
): EntryAssistRule {
  const enabledByDefault = tier === "tier1";
  const featureFlag = tier === "tier1" ? "primary" : tier === "tier2" ? "secondary" : "watchlist";
  return {
    id,
    tier,
    symbol,
    session,
    variant,
    enabledByDefault,
    featureFlag,
    internal,
    customer: { sessionLabel: sessionCustomerLabel(session) },
  };
}

// ─── Tier 1 (enabled by default, flag "primary") ────────────────────────────
export const TIER1_RULES: readonly EntryAssistRule[] = [
  rule("gbpusd-asia", "tier1", "GBPUSD", "ASIA_0000_0659_LDN", "BEST_ema3_gap20_persist2_align", {
    horizon: 32, model: "TP2.0/SL1.0", n: 110, expectancyR: 0.309, winRate: 43.64, breakevenRate: 33.33, edge: 10.30, stability: 3.68,
  }),
  rule("gbpaud-asia", "tier1", "GBPAUD", "ASIA_0000_0659_LDN", "BEST_ema3_gap20_persist2_align", {
    horizon: 32, model: "TP2.0/SL1.0", n: 101, expectancyR: 0.248, winRate: 41.58, breakevenRate: 33.33, edge: 8.25, stability: 3.09,
  }),
  rule("gbpjpy-ny-afternoon", "tier1", "GBPJPY", "NY_AFTERNOON_1200_1659_NY", "STRICT_ema3_gap30_persist2_align", {
    horizon: 32, model: "TP2.0/SL1.0", n: 61, expectancyR: 0.215, winRate: 40.98, breakevenRate: 33.33, edge: 7.65, stability: 3.18,
  }),
] as const;

// ─── Tier 2 (disabled by default, flag "secondary", exactly 9) ──────────────
export const TIER2_RULES: readonly EntryAssistRule[] = [
  rule("audusd-dead", "tier2", "AUDUSD", "DEAD_OTHER", "STRICT_ema3_gap30_persist2_align", {
    horizon: 32, model: "TP2.0/SL1.0", n: 28, expectancyR: 0.607, winRate: 53.57, edge: 20.24, stability: 3.88,
  }),
  rule("chfjpy-asia", "tier2", "CHFJPY", "ASIA_0000_0659_LDN", "STRICT_ema3_gap30_persist2_align", {
    horizon: 32, model: "TP2.0/SL1.0", n: 113, expectancyR: 0.195, winRate: 39.82, edge: 6.49, stability: 2.86,
  }),
  rule("gbpnzd-ny-morning", "tier2", "GBPNZD", "NY_MORNING_OVERLAP_0800_1159_NY", "BEST_ema3_gap20_persist2_align", {
    horizon: 32, model: "TP0.5/SL0.5", n: 47, expectancyR: 0.277, winRate: 63.83, edge: 13.83, stability: 3.52,
  }),
  rule("gbpusd-london-midday", "tier2", "GBPUSD", "LONDON_MIDDAY_1100_1259_LDN", "BEST_ema3_gap20_persist2_align", {
    horizon: 48, model: "TP2.0/SL1.0", n: 39, expectancyR: 0.361, winRate: 48.72, edge: 15.38, stability: 3.16,
  }),
  rule("usdjpy-london-midday", "tier2", "USDJPY", "LONDON_MIDDAY_1100_1259_LDN", "STRICT_ema3_gap30_persist2_align", {
    horizon: 48, model: "TP1.0/SL1.0", n: 28, expectancyR: 0.357, winRate: 67.86, edge: 17.86, stability: 3.23,
  }),
  rule("cadjpy-london-open", "tier2", "CADJPY", "LONDON_OPEN_0700_1059_LDN", "BEST_ema3_gap20_persist2_align", {
    horizon: 32, model: "TP1.0/SL0.75", n: 47, expectancyR: 0.241, winRate: 53.19, edge: 10.33, stability: 3.11,
  }),
  rule("audnzd-asia", "tier2", "AUDNZD", "ASIA_0000_0659_LDN", "BEST_ema3_gap20_persist2_align", {
    horizon: 32, model: "TP2.0/SL1.0", n: 110, expectancyR: 0.118, winRate: 37.27, edge: 3.94, stability: 2.52,
  }),
  rule("gbpchf-ny-afternoon", "tier2", "GBPCHF", "NY_AFTERNOON_1200_1659_NY", "STRICT_ema3_gap30_persist2_align", {
    horizon: 32, model: "TP1.0/SL0.75", n: 49, expectancyR: 0.190, winRate: 51.02, edge: 8.16, stability: 3.13,
  }),
  rule("eurcad-london-open", "tier2", "EURCAD", "LONDON_OPEN_0700_1059_LDN", "STRICT_ema3_gap30_persist2_align", {
    horizon: 32, model: "TP2.0/SL1.0", n: 65, expectancyR: 0.200, winRate: 40.00, edge: 6.67, stability: 2.46,
  }),
] as const;

// ─── Watchlist (disabled by default, flag "watchlist", exactly 5) ───────────
// Internal-only: NEVER customer-eligible, even when its flag is enabled.
export const WATCHLIST_RULES: readonly EntryAssistRule[] = [
  rule("gbpcad-dead", "watchlist", "GBPCAD", "DEAD_OTHER", "STRICT_ema3_gap30_persist2_align", {
    horizon: 32, model: "TP2.0/SL1.0", n: 23, expectancyR: 0.435, winRate: 47.83, edge: 14.49,
  }),
  rule("usdchf-asia", "watchlist", "USDCHF", "ASIA_0000_0659_LDN", "BEST_ema3_gap20_persist2_align", {
    horizon: 32, model: "TP2.0/SL1.0", n: 106, expectancyR: 0.075, winRate: 35.85, edge: 2.52,
  }),
  rule("cadchf-dead", "watchlist", "CADCHF", "DEAD_OTHER", "BEST_ema3_gap20_persist2_align", {
    horizon: 32, model: "TP1.5/SL1.0", n: 25, expectancyR: 0.300, winRate: 52.00, edge: 12.00,
  }),
  rule("gbpaud-ny-afternoon", "watchlist", "GBPAUD", "NY_AFTERNOON_1200_1659_NY", "BEST_ema3_gap20_persist2_align", {
    horizon: 32, model: "TP1.5/SL1.0", n: 55, expectancyR: 0.152, winRate: 38.18, edge: 4.85,
  }),
  rule("audjpy-london-open", "watchlist", "AUDJPY", "LONDON_OPEN_0700_1059_LDN", "STRICT_ema3_gap30_persist2_align", {
    horizon: 32, model: "TP1.5/SL1.0", n: 50, expectancyR: 0.100, winRate: 44.00, edge: 4.00,
  }),
] as const;

export const ALL_RULES: readonly EntryAssistRule[] = [
  ...TIER1_RULES,
  ...TIER2_RULES,
  ...WATCHLIST_RULES,
];

// ─── Feature flags (server env; values never leave the server) ──────────────
export interface FeatureFlags {
  enablePrimaryEntryAssist: boolean;
  enableSecondaryEntryAssist: boolean;
  enableMomentumWatchlist: boolean;
}

export function readFeatureFlags(env: NodeJS.ProcessEnv = process.env): FeatureFlags {
  return {
    enablePrimaryEntryAssist: env.ENTRY_ASSIST_PRIMARY_DISABLED !== "1",
    enableSecondaryEntryAssist: env.ENTRY_ASSIST_SECONDARY_ENABLED === "1",
    enableMomentumWatchlist: env.ENTRY_ASSIST_WATCHLIST_ENABLED === "1",
  };
}

/**
 * Rules that may reach a customer. Tier 1 when primary is on, Tier 2 when
 * secondary is on. Watchlist is deliberately excluded regardless of its flag.
 */
export function getCustomerEligibleRules(flags: FeatureFlags): EntryAssistRule[] {
  const out: EntryAssistRule[] = [];
  if (flags.enablePrimaryEntryAssist) out.push(...TIER1_RULES);
  if (flags.enableSecondaryEntryAssist) out.push(...TIER2_RULES);
  // Watchlist rules are never customer-eligible.
  return out;
}

export function isStrictVariant(variant: VariantId): boolean {
  return variant === "STRICT_ema3_gap30_persist2_align";
}
