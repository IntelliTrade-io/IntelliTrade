import { describe, it, expect } from "vitest";
import { evaluateRules } from "./evaluator";
import type { NormalizedSnapshot, PairLabel } from "./snapshots";
import {
  TIER1_RULES,
  TIER2_RULES,
  getCustomerEligibleRules,
  readFeatureFlags,
} from "./rulebook";

const GBPUSD_ASIA = TIER1_RULES.find((r) => r.id === "gbpusd-asia")!;
const GBPJPY_NY = TIER1_RULES.find((r) => r.id === "gbpjpy-ny-afternoon")!; // STRICT, L=30
const DEFAULT_RULES = getCustomerEligibleRules(readFeatureFlags({}));

// GBPUSD snapshot in the Asia session (winter: London == UTC). gap = GBP - USD.
function gu(asof: string, gap: number, label: PairLabel = "bullish"): NormalizedSnapshot {
  return { asof: new Date(asof), scores: { GBP: gap, USD: 0 }, pairLabels: { GBPUSD: label }, createdAt: asof };
}

// GBPJPY snapshot in the NY afternoon session (winter: NY 12:00 == 17:00Z).
function gj(asof: string, gap: number, label: PairLabel = "bullish"): NormalizedSnapshot {
  return { asof: new Date(asof), scores: { GBP: gap, JPY: 0 }, pairLabels: { GBPJPY: label }, createdAt: asof };
}

const T = (m: string) => new Date(`2024-01-15T${m}:00Z`);

// Asia-session timeline at 15-min cadence.
const A0 = "2024-01-15T03:00:00Z";
const A1 = "2024-01-15T03:15:00Z";
const A2 = "2024-01-15T03:30:00Z";
const A3 = "2024-01-15T03:45:00Z";
const A4 = "2024-01-15T04:00:00Z";
const A5 = "2024-01-15T04:15:00Z";
const A6 = "2024-01-15T04:30:00Z";

function evalGbpusd(snaps: NormalizedSnapshot[], nowIso: string) {
  return evaluateRules(snaps, [GBPUSD_ASIA], new Date(nowIso));
}

describe("evaluator — crossover and persist2 confirmation (BEST, L=20)", () => {
  it("bullish crossover is Watching at the crossover snapshot, not Confirmed", () => {
    const out = evalGbpusd([gu(A0, 0), gu(A1, 0), gu(A2, 50)], A2);
    expect(out).toHaveLength(1);
    expect(out[0]!.state).toBe("watching");
    expect(out[0]!.direction).toBe("bullish");
    expect(out[0]!.symbol).toBe("GBPUSD");
  });

  it("Confirmed exactly at crossover+1 when the next snapshot holds", () => {
    const out = evalGbpusd([gu(A0, 0), gu(A1, 0), gu(A2, 50), gu(A3, 60)], A3);
    expect(out).toHaveLength(1);
    expect(out[0]!.state).toBe("confirmed");
  });

  it("bearish crossover confirms symmetrically", () => {
    const out = evalGbpusd(
      [gu(A0, 0), gu(A1, 0), gu(A2, -50, "bearish"), gu(A3, -60, "bearish")],
      A3,
    );
    expect(out).toHaveLength(1);
    expect(out[0]!.state).toBe("confirmed");
    expect(out[0]!.direction).toBe("bearish");
  });

  it("a crossover whose next snapshot drops below the level never confirms", () => {
    const out = evalGbpusd([gu(A0, 0), gu(A1, 0), gu(A2, 50), gu(A3, -40)], A3);
    expect(out).toHaveLength(0);
  });

  it("STRICT (L=30) does not activate at smoothed separation 20-29", () => {
    // ema peaks at 25 (< 30) so no crossover for the STRICT GBPJPY rule.
    const out = evaluateRules([gj("2024-01-15T17:00:00Z", 0), gj("2024-01-15T17:15:00Z", 0), gj("2024-01-15T17:30:00Z", 50)], [GBPJPY_NY], new Date("2024-01-15T17:30:00Z"));
    expect(out).toHaveLength(0);
  });
});

describe("evaluator — pair alignment gating", () => {
  it("a neutral label at the crossover snapshot produces no Watching", () => {
    const out = evalGbpusd([gu(A0, 0), gu(A1, 0), gu(A2, 50, "neutral")], A2);
    expect(out).toHaveLength(0);
  });

  it("a neutral label at the confirmation snapshot blocks confirmation", () => {
    const out = evalGbpusd([gu(A0, 0), gu(A1, 0), gu(A2, 50), gu(A3, 60, "neutral")], A3);
    expect(out).toHaveLength(0);
  });

  it("an inverted label after Confirmed removes immediately (no Fading)", () => {
    const out = evalGbpusd(
      [gu(A0, 0), gu(A1, 0), gu(A2, 50), gu(A3, 60), gu(A4, 60, "bearish")],
      A4,
    );
    expect(out).toHaveLength(0);
  });
});

describe("evaluator — lifecycle transitions", () => {
  it("Confirmed -> Fading when separation weakens while alignment holds", () => {
    const out = evalGbpusd([gu(A0, 0), gu(A1, 0), gu(A2, 50), gu(A3, 60), gu(A4, -60)], A4);
    expect(out).toHaveLength(1);
    expect(out[0]!.state).toBe("fading");
  });

  it("Fading is removed after 2 snapshots", () => {
    const base = [gu(A0, 0), gu(A1, 0), gu(A2, 50), gu(A3, 60), gu(A4, -60), gu(A5, -60), gu(A6, -60)];
    // Fade begins at A4; visible at A4 and A5; removed by A6.
    expect(evalGbpusd(base.slice(0, 6), A5)[0]!.state).toBe("fading");
    expect(evalGbpusd(base, A6)).toHaveLength(0);
  });

  it("session end removes immediately (no cross-session carry)", () => {
    // A confirmed candidate, then a snapshot outside the Asia window.
    const out = evalGbpusd(
      [gu(A0, 0), gu(A1, 0), gu(A2, 50), gu(A3, 60), gu("2024-01-15T08:00:00Z", 60)],
      "2024-01-15T08:00:00Z",
    );
    expect(out).toHaveLength(0);
  });

  it("no crossover yields no candidate", () => {
    const out = evalGbpusd([gu(A0, 0), gu(A1, 0), gu(A2, 0), gu(A3, 0)], A3);
    expect(out).toHaveLength(0);
  });
});

describe("evaluator — cooldown", () => {
  it("suppresses a second crossover within 4 snapshots of the prior event", () => {
    // A2 crosses (Watching). A3 fails confirm (removed). A4 re-crosses but is
    // within the 4-snapshot cooldown of A2, so no new candidate is created.
    const out = evalGbpusd([gu(A0, 0), gu(A1, 0), gu(A2, 50), gu(A3, -40), gu(A4, 60)], A4);
    expect(out).toHaveLength(0);
  });

  it("does not block lifecycle updates of an existing candidate (Confirmed still happens)", () => {
    // Confirmation at A3 is a lifecycle update within the cooldown of the A2 crossover.
    const out = evalGbpusd([gu(A0, 0), gu(A1, 0), gu(A2, 50), gu(A3, 60)], A3);
    expect(out[0]!.state).toBe("confirmed");
  });
});

describe("evaluator — robustness", () => {
  it("out-of-order and duplicate snapshots are normalized safely", () => {
    const shuffled = [gu(A3, 60), gu(A0, 0), gu(A2, 50), gu(A2, 50), gu(A1, 0)];
    const out = evalGbpusd(shuffled, A3);
    expect(out).toHaveLength(1);
    expect(out[0]!.state).toBe("confirmed");
  });

  it("missing required scores drops the snapshot and removes the candidate", () => {
    const broken: NormalizedSnapshot = {
      asof: new Date(A3),
      scores: { USD: 0 }, // GBP missing
      pairLabels: { GBPUSD: "bullish" },
      createdAt: A3,
    };
    const out = evalGbpusd([gu(A0, 0), gu(A1, 0), gu(A2, 50), broken], A3);
    expect(out).toHaveLength(0);
  });

  it("a stale newest snapshot yields zero candidates", () => {
    // now is 45 minutes after the newest snapshot (> 35 min staleness bound).
    const out = evalGbpusd([gu(A0, 0), gu(A1, 0), gu(A2, 50), gu(A3, 60)], "2024-01-15T04:30:00Z");
    expect(out).toHaveLength(0);
  });

  it("empty history yields zero candidates", () => {
    expect(evalGbpusd([], A0)).toHaveLength(0);
  });
});

describe("evaluator — session and rule scoping", () => {
  it("a wrong-session but otherwise perfect sequence never activates", () => {
    // Same shape as a clean confirm, but timestamps are in London open, not Asia.
    const L = (m: string) => `2024-01-15T${m}:00Z`;
    const snaps = [
      gu(L("09:00"), 0), gu(L("09:15"), 0), gu(L("09:30"), 50), gu(L("09:45"), 60),
    ];
    const out = evaluateRules(snaps, [GBPUSD_ASIA], new Date(L("09:45")));
    expect(out).toHaveLength(0);
  });

  it("tier2 and watchlist produce nothing under default flags", () => {
    // Feed data that would activate an AUDUSD (tier2) pair; default rules exclude it.
    const audusd = (asof: string, gap: number): NormalizedSnapshot => ({
      asof: new Date(asof),
      scores: { AUD: gap, USD: 0 },
      pairLabels: { AUDUSD: "bullish" },
      createdAt: asof,
    });
    const out = evaluateRules(
      [audusd(A0, 0), audusd(A1, 0), audusd(A2, 60), audusd(A3, 70)],
      DEFAULT_RULES,
      T("03:45"),
    );
    expect(out).toHaveLength(0);
  });

  it("an arbitrary strong-vs-weak non-Tier1 symbol never activates under defaults", () => {
    // EUR/JPY has no Tier 1 rule; strong EUR + weak JPY must not surface anything.
    const ej = (asof: string, gap: number): NormalizedSnapshot => ({
      asof: new Date(asof),
      scores: { EUR: gap, JPY: 0 },
      pairLabels: { EURJPY: "bullish" },
      createdAt: asof,
    });
    const out = evaluateRules(
      [ej(A0, 0), ej(A1, 0), ej(A2, 60), ej(A3, 70)],
      DEFAULT_RULES,
      T("03:45"),
    );
    expect(out).toHaveLength(0);
  });

  it("tier2 activates only when its rule set is supplied (sanity check)", () => {
    // Confirms the AUDUSD data itself is valid: with the tier2 rule present it
    // would surface. AUDUSD tier2 session is DEAD_OTHER, so use an out-of-session
    // instant (22:00Z winter is outside every real session).
    const audusdTier2 = TIER2_RULES.find((r) => r.id === "audusd-dead")!;
    const audusd = (asof: string, gap: number): NormalizedSnapshot => ({
      asof: new Date(asof),
      scores: { AUD: gap, USD: 0 },
      pairLabels: { AUDUSD: "bullish" },
      createdAt: asof,
    });
    const D0 = "2024-01-15T22:00:00Z";
    const D1 = "2024-01-15T22:15:00Z";
    const D2 = "2024-01-15T22:30:00Z";
    const D3 = "2024-01-15T22:45:00Z";
    const out = evaluateRules(
      [audusd(D0, 0), audusd(D1, 0), audusd(D2, 70), audusd(D3, 80)],
      [audusdTier2],
      new Date(D3),
    );
    expect(out).toHaveLength(1);
    expect(out[0]!.state).toBe("confirmed");
  });
});
