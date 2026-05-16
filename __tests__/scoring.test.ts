import { describe, it, expect } from "vitest";
import {
  scoreSeverity,
  scoreHotspotSeverity,
  deriveTags,
  getRecencyBoost,
} from "../lib/conflicts/scoring";

describe("scoreSeverity", () => {
  const NOW = new Date("2026-04-11T20:00:00Z");

  it("scores high for airstrike titles", () => {
    const { severityLabel, severityScore } = scoreSeverity({
      title: "Israeli airstrike kills 30 in Gaza",
      dateIso: NOW.toISOString(),
      now: NOW,
    });
    expect(severityScore).toBeGreaterThan(66);
    expect(severityLabel).toBe("High");
  });

  it("scores medium for clashes with strong keywords", () => {
    const { severityLabel } = scoreSeverity({
      title: "Troops attack border killing soldiers",
      dateIso: NOW.toISOString(),
      now: NOW,
    });
    expect(severityLabel).toBe("Medium");
  });

  it("scores low for diplomacy titles", () => {
    const { severityLabel } = scoreSeverity({
      title: "Ceasefire talks resume in Vienna",
      dateIso: NOW.toISOString(),
      now: NOW,
    });
    expect(severityLabel).toBe("Low");
  });

  it("returns reasons array", () => {
    const { severityReasons } = scoreSeverity({
      title: "Missile strike hits capital",
      dateIso: NOW.toISOString(),
      now: NOW,
    });
    expect(Array.isArray(severityReasons)).toBe(true);
    expect(severityReasons.length).toBeGreaterThan(0);
  });

  it("score is clamped to 0-100", () => {
    const { severityScore } = scoreSeverity({
      title: "missile airstrike artillery bomb shelling incursion drone attack",
      dateIso: NOW.toISOString(),
      now: NOW,
    });
    expect(severityScore).toBeLessThanOrEqual(100);
    expect(severityScore).toBeGreaterThanOrEqual(0);
  });
});

describe("scoreHotspotSeverity", () => {
  it("scores high when hotspot count is close to max", () => {
    const { severityLabel } = scoreHotspotSeverity({
      hotspotCount: 100,
      maxHotspotCount: 100,
    });
    expect(severityLabel).toBe("High");
  });

  it("scores low for single mention", () => {
    const { severityLabel, severityScore } = scoreHotspotSeverity({
      hotspotCount: 1,
      maxHotspotCount: 100,
    });
    expect(severityLabel).toBe("Low");
    expect(severityScore).toBeLessThan(34);
  });

  it("severe headline overrides low count to at least Medium", () => {
    const { severityLabel } = scoreHotspotSeverity({
      hotspotCount: 3,
      maxHotspotCount: 100,
      headlineText: "Artillery shelling in border town",
    });
    expect(["Medium", "High"]).toContain(severityLabel);
  });
});

describe("deriveTags", () => {
  it("extracts airstrike tag", () => {
    expect(deriveTags("Airstrike destroys building")).toContain("Airstrikes");
  });

  it("extracts diplomacy tag", () => {
    expect(deriveTags("Ceasefire talks begin")).toContain("Diplomacy");
  });

  it("returns empty for irrelevant text", () => {
    expect(deriveTags("Sports team wins championship")).toHaveLength(0);
  });

  it("returns multiple matching tags", () => {
    const tags = deriveTags("Drone missile attack killed soldiers");
    expect(tags.length).toBeGreaterThan(1);
  });
});

describe("getRecencyBoost", () => {
  it("returns max boost for very recent events", () => {
    const now = new Date("2026-04-11T20:00:00Z");
    const boost = getRecencyBoost({ dateIso: now.toISOString(), maxBoost: 10, now });
    expect(boost).toBe(10);
  });

  it("returns zero for old events", () => {
    const now = new Date("2026-04-11T20:00:00Z");
    const oldDate = new Date(now.getTime() - 40 * 24 * 60 * 60 * 1000);
    const boost = getRecencyBoost({ dateIso: oldDate.toISOString(), now });
    expect(boost).toBe(0);
  });
});
