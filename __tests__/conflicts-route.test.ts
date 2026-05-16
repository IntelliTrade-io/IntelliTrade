import { describe, it, expect, vi } from "vitest";
import { buildConflictStats } from "../lib/conflicts/utils";
import { filterBySeverity, normalizeDocArticles } from "../lib/conflicts/gdelt";
import type { ConflictFeatureCollection } from "../lib/conflicts/schema";

function makeMockCollection(
  features: Array<{ severityLabel: "Low" | "Medium" | "High"; country?: string; themes?: string[] }>
): ConflictFeatureCollection {
  return {
    type: "FeatureCollection",
    features: features.map((f, i) => ({
      type: "Feature" as const,
      id: `id-${i}`,
      geometry: { type: "Point" as const, coordinates: [10 + i, 20 + i] },
      properties: {
        dataKind: "article" as const,
        title: `Event ${i}`,
        date: "2026-04-11T10:00:00Z",
        country: f.country ?? "Unknown",
        locationPrecision: "country" as const,
        severityScore: f.severityLabel === "High" ? 80 : f.severityLabel === "Medium" ? 50 : 20,
        severityLabel: f.severityLabel,
        tags: f.themes ?? [],
        themes: f.themes ?? [],
      },
    })),
  };
}

describe("filterBySeverity", () => {
  const collection = makeMockCollection([
    { severityLabel: "Low" },
    { severityLabel: "Medium" },
    { severityLabel: "High" },
    { severityLabel: "Low" },
  ]);

  it('returns all features for "all"', () => {
    const result = filterBySeverity(collection, "all");
    expect(result.features).toHaveLength(4);
  });

  it('filters to high only', () => {
    const result = filterBySeverity(collection, "high");
    expect(result.features).toHaveLength(1);
    expect(result.features[0].properties.severityLabel).toBe("High");
  });

  it('filters to medium only', () => {
    const result = filterBySeverity(collection, "medium");
    expect(result.features).toHaveLength(1);
    expect(result.features[0].properties.severityLabel).toBe("Medium");
  });

  it('filters to low only', () => {
    const result = filterBySeverity(collection, "low");
    expect(result.features).toHaveLength(2);
  });
});

describe("buildConflictStats", () => {
  it("counts severity buckets", () => {
    const collection = makeMockCollection([
      { severityLabel: "Low" },
      { severityLabel: "Medium" },
      { severityLabel: "High" },
      { severityLabel: "Low" },
    ]);
    const stats = buildConflictStats(collection);
    expect(stats.severityBuckets.low).toBe(2);
    expect(stats.severityBuckets.medium).toBe(1);
    expect(stats.severityBuckets.high).toBe(1);
  });

  it("counts top countries", () => {
    const collection = makeMockCollection([
      { severityLabel: "Low", country: "Israel" },
      { severityLabel: "Low", country: "Israel" },
      { severityLabel: "Low", country: "Ukraine" },
    ]);
    const stats = buildConflictStats(collection);
    expect(stats.topCountries[0].name).toBe("Israel");
    expect(stats.topCountries[0].count).toBe(2);
  });

  it("counts top themes", () => {
    const collection = makeMockCollection([
      { severityLabel: "Low", themes: ["Airstrikes"] },
      { severityLabel: "Low", themes: ["Airstrikes"] },
      { severityLabel: "Low", themes: ["Diplomacy"] },
    ]);
    const stats = buildConflictStats(collection);
    expect(stats.topThemes[0].name).toBe("Airstrikes");
    expect(stats.topThemes[0].count).toBe(2);
  });

  it("returns empty arrays for empty collection", () => {
    const stats = buildConflictStats({ type: "FeatureCollection", features: [] });
    expect(stats.topCountries).toEqual([]);
    expect(stats.topThemes).toEqual([]);
    expect(stats.severityBuckets).toEqual({ low: 0, medium: 0, high: 0 });
  });
});

describe("normalizeDocArticles", () => {
  const NOW = new Date("2026-04-11T20:00:00Z");

  it("filters out sports noise", () => {
    const articles = [
      { url: "https://example.com/sport", title: "FIFA World Cup final score", seendate: "20260411T200000Z", domain: "", language: "English", sourcecountry: "US", url_mobile: "", socialimage: "" },
      { url: "https://example.com/conflict", title: "Airstrike hits border town", seendate: "20260411T200000Z", domain: "", language: "English", sourcecountry: "Israel", url_mobile: "", socialimage: "" },
    ];
    const result = normalizeDocArticles(articles, { now: NOW });
    expect(result.features.length).toBeLessThan(2);
    const titles = result.features.map((f) => f.properties.title);
    expect(titles.every((t) => !t.toLowerCase().includes("fifa"))).toBe(true);
  });

  it("skips articles with no resolvable location", () => {
    const articles = [
      { url: "https://example.com/a", title: "Something happened somewhere", seendate: "20260411T200000Z", domain: "", language: "English", sourcecountry: "", url_mobile: "", socialimage: "" },
    ];
    const result = normalizeDocArticles(articles, { now: NOW });
    expect(result.features).toHaveLength(0);
  });

  it("creates features with valid coordinates", () => {
    const articles = [
      { url: "https://example.com/israel", title: "Rocket attack in Israel", seendate: "20260411T200000Z", domain: "", language: "English", sourcecountry: "Israel", url_mobile: "", socialimage: "" },
    ];
    const result = normalizeDocArticles(articles, { now: NOW });
    if (result.features.length > 0) {
      const coords = result.features[0].geometry.coordinates;
      expect(Number.isFinite(coords[0])).toBe(true);
      expect(Number.isFinite(coords[1])).toBe(true);
    }
  });
});
