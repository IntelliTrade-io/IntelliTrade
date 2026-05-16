import { describe, expect, it } from "vitest";

import { scoreHotspotSeverity, scoreSeverity } from "@/lib/scoring";

describe("scoreSeverity", () => {
  it("produces High for missile strike with recent date", () => {
    const result = scoreSeverity({
      title: "Missile strike kills dozens near the capital",
      dateIso: "2026-03-13T11:30:00Z",
      now: new Date("2026-03-13T12:00:00Z")
    });

    expect(result.severityScore).toBeGreaterThanOrEqual(67);
    expect(result.severityLabel).toBe("High");
    expect(result.severityReasons.some((r) => r.includes("missile"))).toBe(true);
  });

  it("produces at least Medium for airstrike content", () => {
    const result = scoreSeverity({
      title: "Airstrike reported near the border crossing",
      dateIso: "2026-03-13T11:30:00Z",
      now: new Date("2026-03-13T12:00:00Z")
    });

    expect(result.severityScore).toBeGreaterThanOrEqual(34);
    expect(["Medium", "High"]).toContain(result.severityLabel);
  });

  it("produces at least Medium for explosion content with strong boost", () => {
    const result = scoreSeverity({
      title: "Explosion kills multiple civilians in busy market",
      dateIso: "2026-03-13T11:30:00Z",
      now: new Date("2026-03-13T12:00:00Z")
    });

    expect(result.severityScore).toBeGreaterThanOrEqual(34);
    expect(["Medium", "High"]).toContain(result.severityLabel);
  });

  it("adds tone-based severity for very negative signals", () => {
    const result = scoreSeverity({
      title: "Attack reported after overnight barrage",
      dateIso: "2026-03-13T09:30:00Z",
      gdeltTone: -65,
      now: new Date("2026-03-13T12:00:00Z")
    });

    expect(result.severityScore).toBeGreaterThan(40);
  });

  it("keeps diplomacy-only content at Low", () => {
    const result = scoreSeverity({
      title: "Ceasefire talks and negotiations continue in Vienna",
      dateIso: "2026-02-12T09:30:00Z",
      now: new Date("2026-03-13T12:00:00Z")
    });

    expect(result.severityLabel).toBe("Low");
    expect(result.severityReasons.some((r) => r.toLowerCase().includes("diplomacy"))).toBe(true);
  });

  it("populates severityReasons for all scored events", () => {
    const result = scoreSeverity({
      title: "Shelling reported along the northern front",
      dateIso: "2026-03-13T11:00:00Z",
      now: new Date("2026-03-13T12:00:00Z")
    });

    expect(Array.isArray(result.severityReasons)).toBe(true);
    expect(result.severityReasons.length).toBeGreaterThan(0);
  });

  it("does not push ceasefire + diplomacy content above Low", () => {
    const result = scoreSeverity({
      title: "Summit delegation agrees diplomatic statement on ceasefire",
      dateIso: "2026-03-10T09:00:00Z",
      now: new Date("2026-03-13T12:00:00Z")
    });

    expect(result.severityLabel).toBe("Low");
  });
});

describe("scoreHotspotSeverity", () => {
  it("does not force a single-hotspot result into high severity", () => {
    const result = scoreHotspotSeverity({
      hotspotCount: 1,
      maxHotspotCount: 1,
      recencyBoost: 0
    });

    expect(result.severityScore).toBeLessThan(40);
    expect(result.severityLabel).toBe("Low");
  });

  it("uses the fixed baseline when maxHotspotCount is 1", () => {
    const low = scoreHotspotSeverity({
      hotspotCount: 1,
      maxHotspotCount: 1,
      recencyBoost: 0
    });
    const high = scoreHotspotSeverity({
      hotspotCount: 50,
      maxHotspotCount: 1,
      recencyBoost: 0
    });

    expect(high.severityScore).toBeGreaterThan(low.severityScore);
    expect(high.severityLabel).toBe("High");
  });

  it("approaches the upper band when hotspot count reaches the observed max", () => {
    const result = scoreHotspotSeverity({
      hotspotCount: 100,
      maxHotspotCount: 100,
      recencyBoost: 0
    });

    expect(result.severityScore).toBeGreaterThanOrEqual(78);
    expect(result.severityLabel).toBe("High");
  });

  it("remains monotonic as hotspot count increases", () => {
    const scores = [1, 5, 25, 50].map((hotspotCount) =>
      scoreHotspotSeverity({
        hotspotCount,
        maxHotspotCount: 1,
        recencyBoost: 0
      }).severityScore
    );

    expect(scores[1]).toBeGreaterThanOrEqual(scores[0]);
    expect(scores[2]).toBeGreaterThanOrEqual(scores[1]);
    expect(scores[3]).toBeGreaterThanOrEqual(scores[2]);
  });

  it("applies negative tone boosts and clamps the total score", () => {
    const result = scoreHotspotSeverity({
      hotspotCount: 100,
      gdeltTone: -100,
      maxHotspotCount: 100,
      recencyBoost: 20
    });

    expect(result.severityScore).toBe(100);
    expect(result.severityLabel).toBe("High");
  });

  it("forces at least Medium when severe term appears in hotspot headline with meaningful count", () => {
    const result = scoreHotspotSeverity({
      hotspotCount: 5,
      maxHotspotCount: 50,
      recencyBoost: 0,
      headlineText: "Missile strike reported near the border"
    });

    expect(result.severityLabel).not.toBe("Low");
    expect(result.severityScore).toBeGreaterThanOrEqual(34);
    expect(
      result.severityReasons.some((r) =>
        r.toLowerCase().includes("missile")
      )
    ).toBe(true);
  });

  it("does not give a keyword boost when no severe terms are present", () => {
    const withoutKeyword = scoreHotspotSeverity({
      hotspotCount: 5,
      maxHotspotCount: 50,
      recencyBoost: 0,
      headlineText: "Peace negotiations continue in Geneva"
    });

    const withKeyword = scoreHotspotSeverity({
      hotspotCount: 5,
      maxHotspotCount: 50,
      recencyBoost: 0,
      headlineText: "Airstrike destroys bridge on the frontline"
    });

    expect(withKeyword.severityScore).toBeGreaterThan(withoutKeyword.severityScore);
  });

  it("populates severityReasons for all scored hotspots", () => {
    const result = scoreHotspotSeverity({
      hotspotCount: 50,
      maxHotspotCount: 100,
      recencyBoost: 5
    });

    expect(Array.isArray(result.severityReasons)).toBe(true);
  });
});
