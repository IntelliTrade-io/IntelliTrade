import { describe, it, expect } from "vitest";
import {
  TIER1_RULES,
  TIER2_RULES,
  WATCHLIST_RULES,
  ALL_RULES,
  readFeatureFlags,
  getCustomerEligibleRules,
} from "./rulebook";
import { toPublicCandidate } from "./dto";
import type { EvaluatedCandidate } from "./evaluator";

describe("rulebook — counts and defaults", () => {
  it("exactly 3 tier1, all enabled by default and flagged primary", () => {
    expect(TIER1_RULES).toHaveLength(3);
    for (const r of TIER1_RULES) {
      expect(r.tier).toBe("tier1");
      expect(r.enabledByDefault).toBe(true);
      expect(r.featureFlag).toBe("primary");
    }
  });

  it("exactly 9 tier2, disabled by default and flagged secondary", () => {
    expect(TIER2_RULES).toHaveLength(9);
    for (const r of TIER2_RULES) {
      expect(r.tier).toBe("tier2");
      expect(r.enabledByDefault).toBe(false);
      expect(r.featureFlag).toBe("secondary");
    }
  });

  it("exactly 5 watchlist, disabled by default and flagged watchlist", () => {
    expect(WATCHLIST_RULES).toHaveLength(5);
    for (const r of WATCHLIST_RULES) {
      expect(r.tier).toBe("watchlist");
      expect(r.enabledByDefault).toBe(false);
      expect(r.featureFlag).toBe("watchlist");
    }
  });

  it("rule ids are unique", () => {
    const ids = ALL_RULES.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("rulebook — flag eligibility", () => {
  it("only the three tier1 rules are customer-eligible under default flags", () => {
    const eligible = getCustomerEligibleRules(readFeatureFlags({}));
    expect(eligible).toHaveLength(3);
    expect(eligible.every((r) => r.tier === "tier1")).toBe(true);
  });

  it("secondary flag adds tier2", () => {
    const eligible = getCustomerEligibleRules(
      readFeatureFlags({ ENTRY_ASSIST_SECONDARY_ENABLED: "1" }),
    );
    expect(eligible).toHaveLength(12);
    expect(eligible.some((r) => r.tier === "tier2")).toBe(true);
    expect(eligible.some((r) => r.tier === "watchlist")).toBe(false);
  });

  it("primary can be disabled", () => {
    const eligible = getCustomerEligibleRules(
      readFeatureFlags({ ENTRY_ASSIST_PRIMARY_DISABLED: "1" }),
    );
    expect(eligible).toHaveLength(0);
  });

  it("watchlist is NEVER customer-eligible, even with its flag on", () => {
    const eligible = getCustomerEligibleRules(
      readFeatureFlags({
        ENTRY_ASSIST_WATCHLIST_ENABLED: "1",
        ENTRY_ASSIST_SECONDARY_ENABLED: "1",
      }),
    );
    expect(eligible.some((r) => r.tier === "watchlist")).toBe(false);
  });
});

describe("rulebook — DTO projection leaks no research keys", () => {
  it("serialized candidate contains no internal research fields", () => {
    const rule = TIER1_RULES[0]!;
    const candidate: EvaluatedCandidate = {
      ruleId: rule.id,
      symbol: rule.symbol,
      baseCode: rule.symbol.slice(0, 3),
      quoteCode: rule.symbol.slice(3, 6),
      direction: "bullish",
      state: "confirmed",
      sessionLabel: rule.customer.sessionLabel,
      variantIsStrict: false,
      updatedAt: "2024-01-15T03:45:00.000Z",
    };
    const json = JSON.stringify(toPublicCandidate(candidate));
    for (const forbidden of [
      "expectancy", "winRate", "\"n\"", "stability", "edge", "TP", "SL",
      "variant", "threshold", "tier", "horizon", "BEST", "STRICT", "DEAD_OTHER",
    ]) {
      expect(json).not.toContain(forbidden);
    }
  });
});
