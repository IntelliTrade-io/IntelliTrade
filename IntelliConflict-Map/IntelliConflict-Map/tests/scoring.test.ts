import { describe, expect, it } from "vitest";

import { scoreHotspotSeverity, scoreSeverity } from "@/lib/scoring";

describe("scoreSeverity", () => {
  it("boosts severe and recent language", () => {
    const result = scoreSeverity({
      title: "Missile strike and shelling reported near the border",
      dateIso: "2026-03-13T11:30:00Z",
      now: new Date("2026-03-13T12:00:00Z")
    });

    expect(result.severityScore).toBeGreaterThanOrEqual(55);
    expect(result.severityLabel).toBe("Medium");
  });

  it("adds tone-based severity for negative signals", () => {
    const result = scoreSeverity({
      title: "Attack reported after overnight barrage",
      dateIso: "2026-03-13T09:30:00Z",
      gdeltTone: -65,
      now: new Date("2026-03-13T12:00:00Z")
    });

    expect(result.severityScore).toBeGreaterThan(40);
  });

  it("reduces diplomatic items toward low severity", () => {
    const result = scoreSeverity({
      title: "Ceasefire talks and negotiations continue",
      dateIso: "2026-02-12T09:30:00Z",
      now: new Date("2026-03-13T12:00:00Z")
    });

    expect(result.severityScore).toBe(0);
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
});
