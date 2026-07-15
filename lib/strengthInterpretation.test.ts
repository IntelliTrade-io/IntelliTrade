import { describe, it, expect } from "vitest";
import {
  computeMovements,
  interpretCurrency,
  interpretAll,
  buildSummaryStrip,
  interpretExpression,
  type HistoryPointLike,
  type StrengthMovement,
} from "./strengthInterpretation";
import { computeExpressions, type Scores } from "./strength";

function scores(map: Record<string, number>): Scores {
  return Object.fromEntries(
    Object.entries(map).map(([code, score]) => [
      code,
      { score, rawScore: score, bias: score > 15 ? "Strong" : score < -15 ? "Weak" : "Neutral" } as const,
    ]),
  );
}

function flatHistory(map: Record<string, number>, count: number): HistoryPointLike[] {
  return Array.from({ length: count }, (_, i) => ({
    ts: new Date(Date.UTC(2026, 6, 1, i)).toISOString(),
    ...map,
  }));
}

const move = (partial: Partial<StrengthMovement>): StrengthMovement => ({
  delta: 0,
  enteredWatch: false,
  directionalRefreshes: 0,
  hasHistory: true,
  ...partial,
});

describe("computeMovements", () => {
  it("returns empty without enough history", () => {
    expect(computeMovements([])).toEqual({});
    expect(computeMovements(flatHistory({ USD: 50 }, 1))).toEqual({});
  });

  it("computes delta vs ~24 points back", () => {
    const points = [
      ...flatHistory({ GBP: 40 }, 25),
      { ts: "2026-07-02T02:00:00Z", GBP: 65 },
    ];
    const m = computeMovements(points);
    expect(m.GBP?.delta).toBe(25);
  });

  it("flags entering the watch range", () => {
    const points = [
      ...flatHistory({ CHF: 10 }, 24),
      { ts: "2026-07-02T01:00:00Z", CHF: 35 },
    ];
    expect(computeMovements(points).CHF?.enteredWatch).toBe(true);
  });

  it("counts consecutive directional refreshes above the confirmed band", () => {
    const points = flatHistory({ JPY: 75 }, 60);
    expect(computeMovements(points).JPY?.directionalRefreshes).toBe(60);
  });

  it("breaks the directional run on a sign flip or dip", () => {
    const points = [
      ...flatHistory({ EUR: -60 }, 10),
      ...flatHistory({ EUR: 55 }, 5),
    ];
    expect(computeMovements(points).EUR?.directionalRefreshes).toBe(5);
  });
});

describe("interpretCurrency", () => {
  it("falls back to score-only labels without history", () => {
    expect(interpretCurrency("GBP", 82).label).toBe("Strong");
    expect(interpretCurrency("EUR", 55).label).toBe("Confirmed");
    expect(interpretCurrency("AUD", 35).label).toBe("Active");
    expect(interpretCurrency("USD", 5).label).toBe("Neutral");
    expect(interpretCurrency("NZD", -35).label).toBe("Weak");
    expect(interpretCurrency("CAD", -60).label).toBe("Confirmed Weak");
    expect(interpretCurrency("CHF", -85).label).toBe("Strong Weak");
  });

  it("labels mature strong currencies", () => {
    const i = interpretCurrency("JPY", 78, move({ directionalRefreshes: 60 }));
    expect(i.label).toBe("Mature / Strong");
    expect(i.stage).toBe("mature");
  });

  it("labels confirmed strong with history but no maturity", () => {
    expect(interpretCurrency("GBP", 75, move({ delta: 2 })).label).toBe("Confirmed / Strong");
  });

  it("marks fading when directional score weakened", () => {
    const i = interpretCurrency("EUR", 40, move({ delta: -18 }));
    expect(i.label).toBe("Fading");
    expect(i.stage).toBe("fading");
  });

  it("marks weak-side recovery as fading too", () => {
    expect(interpretCurrency("NZD", -40, move({ delta: 15 })).label).toBe("Fading Weak");
  });

  it("keeps the strength label above the strong band even if easing", () => {
    expect(interpretCurrency("GBP", 74, move({ delta: -15 })).label).toBe("Confirmed / Strong");
  });

  it("puts newly rising mid-range currencies on the early watchlist", () => {
    const i = interpretCurrency("CHF", 22, move({ delta: 14 }));
    expect(i.label).toBe("Early Watchlist");
    expect(i.tone).toBe("watch");
  });

  it("labels fresh directional entries", () => {
    expect(interpretCurrency("CHF", 34, move({ enteredWatch: true })).label).toBe("Fresh");
  });

  it("mirrors mature weakness as extended", () => {
    expect(interpretCurrency("CAD", -80, move({ directionalRefreshes: 60 })).label).toBe("Extended Weak");
  });
});

describe("buildSummaryStrip", () => {
  const s = scores({ GBP: 78, JPY: 72, CHF: 34, USD: 5, EUR: -20, AUD: -35, CAD: -66, NZD: -74 });
  const exprs = computeExpressions(s);

  it("picks strongest and weakest for confirmed bias", () => {
    const strip = buildSummaryStrip(s, interpretAll(s, {}), exprs, {});
    expect(strip.bias.strongest).toEqual(["GBP", "JPY"]);
    expect(strip.bias.weakest).toEqual(["NZD", "CAD"]);
    expect(strip.bias.note).toBe("High conviction continuation");
  });

  it("pairs fresh currencies against the opposite extreme", () => {
    const movements = { CHF: move({ enteredWatch: true }) };
    const strip = buildSummaryStrip(s, interpretAll(s, movements), exprs, movements);
    expect(strip.watchlist.pairs).toContain("NZDCHF");
    expect(strip.watchlist.pairs).toContain("CADCHF");
  });

  it("falls back to top expressions when nothing is fresh", () => {
    const strip = buildSummaryStrip(s, interpretAll(s, {}), exprs, {});
    expect(strip.watchlist.pairs.length).toBeGreaterThan(0);
    expect(strip.watchlist.pairs[0]).not.toContain("/");
  });

  it("reads regime from leader stages", () => {
    const movements = {
      GBP: move({ directionalRefreshes: 60 }),
      JPY: move({ directionalRefreshes: 60 }),
      NZD: move({ directionalRefreshes: 60 }),
      CAD: move({ directionalRefreshes: 60 }),
    };
    const strip = buildSummaryStrip(s, interpretAll(s, movements), exprs, movements);
    expect(strip.regime.status).toBe("Mature");
    expect(strip.window.value).toBe("1–3 days");
  });

  it("defaults regime to confirmed and window to 3–5 days", () => {
    const strip = buildSummaryStrip(s, interpretAll(s, {}), exprs, {});
    expect(strip.regime.status).toBe("Confirmed");
    expect(strip.window.value).toBe("3–5 days");
  });

  it("reports health as valid without history", () => {
    const strip = buildSummaryStrip(s, interpretAll(s, {}), exprs, {});
    expect(strip.health.status).toBe("Valid");
  });

  it("reports expanding health when the gap widens", () => {
    const movements = { GBP: move({ delta: 12 }), NZD: move({ delta: -6 }) };
    const strip = buildSummaryStrip(s, interpretAll(s, movements), exprs, movements);
    expect(strip.health.status).toBe("Expanding");
  });

  it("grades the strength gap", () => {
    const strip = buildSummaryStrip(s, interpretAll(s, {}), exprs, {});
    expect(strip.gap.status).toBe("Extended"); // 78 - (-74) = 152
    const mild = scores({ GBP: 40, NZD: -45 });
    const mildStrip = buildSummaryStrip(mild, interpretAll(mild, {}), computeExpressions(mild), {});
    expect(mildStrip.gap.status).toBe("Strong"); // gap 85
  });
});

describe("interpretExpression", () => {
  const s = scores({ GBP: 78, NZD: -74 });
  const expr = computeExpressions(s)[0]!;

  it("derives confirmed metadata by default", () => {
    const meta = interpretExpression(expr, interpretAll(s, {}));
    expect(meta.status).toBe("Confirmed");
    expect(meta.window).toBe("3–5d");
    expect(meta.health).toBe("Stable");
  });

  it("marks mature pairs as extended and warns against chasing", () => {
    const interps = interpretAll(s, { GBP: move({ directionalRefreshes: 60 }) });
    const meta = interpretExpression(expr, interps);
    expect(meta.status).toBe("Mature");
    expect(meta.health).toBe("Extended");
    expect(meta.window).toBe("1–3d");
    expect(meta.use).toBe(expr.state === "Bullish" ? "Avoid chasing" : "Fade rallies");
  });

  it("uses bearish wording for bearish pairs", () => {
    const bear = scores({ NZD: 74, GBP: -78 });
    const bearExpr = computeExpressions(bear)[0]!;
    expect(bearExpr.state).toBe("Bearish");
    const meta = interpretExpression(bearExpr, interpretAll(bear, {}));
    expect(meta.use).toBe("Look for shorts");
  });

  it("asks for confirmation on fading pairs", () => {
    const fading = scores({ GBP: 45, NZD: -74 });
    const fadingExpr = computeExpressions(fading)[0]!;
    const interps = interpretAll(fading, { GBP: move({ delta: -20 }) });
    const meta = interpretExpression(fadingExpr, interps);
    expect(meta.status).toBe("Fading");
    expect(meta.health).toBe("Slightly fading");
  });
});
