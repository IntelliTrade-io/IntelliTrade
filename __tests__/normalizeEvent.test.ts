import { describe, it, expect } from "vitest";
import { normalizeEvent, normalizeEvents } from "../lib/conflicts/normalizeEvent";
import type { ConflictFeature } from "../lib/conflicts/schema";

function makeArticle(overrides: Partial<ConflictFeature["properties"]> = {}): ConflictFeature {
  return {
    type: "Feature",
    id: "test-id-1",
    geometry: { type: "Point", coordinates: [35.13, 31.47] },
    properties: {
      dataKind: "article",
      title: "Israel forces attack border",
      date: "2026-04-11T20:30:00Z",
      country: "Israel",
      locationName: "Israel",
      sourceUrl: "https://example.com/article",
      topArticles: [{ title: "Israel forces attack border", url: "https://example.com/article" }],
      locationPrecision: "country",
      severityScore: 42,
      severityLabel: "Medium",
      severityReasons: ["Strong violence indicator"],
      tags: ["Explosions"],
      themes: ["Explosions"],
      ...overrides,
    },
  };
}

function makeHotspot(overrides: Partial<ConflictFeature["properties"]> = {}): ConflictFeature {
  return {
    type: "Feature",
    id: "hotspot-id-1",
    geometry: { type: "Point", coordinates: [31.2, 30.1] },
    properties: {
      dataKind: "hotspot",
      title: "Hotspot: Cairo",
      date: "2026-04-11T18:00:00Z",
      country: "Egypt",
      locationName: "Cairo",
      hotspotCount: 12,
      topArticles: [
        { title: "Protests in Cairo", url: "https://example.com/cairo" },
        { title: "Egypt unrest continues", url: "https://example.com/unrest" },
      ],
      locationPrecision: "exact",
      severityScore: 55,
      severityLabel: "Medium",
      severityReasons: ["Moderate hotspot intensity"],
      tags: ["Ground clashes"],
      themes: ["Ground clashes"],
      ...overrides,
    },
  };
}

describe("normalizeEvent", () => {
  it("returns null for invalid coordinates", () => {
    const feature = makeArticle();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (feature.geometry as any).coordinates = [35, "invalid"];
    expect(normalizeEvent(feature)).toBeNull();
  });

  it("returns null for missing geometry", () => {
    const feature = makeArticle();
    (feature as unknown as { geometry: null }).geometry = null;
    expect(normalizeEvent(feature)).toBeNull();
  });

  it("article: displayTitle uses title when no displayTitle on props", () => {
    const result = normalizeEvent(makeArticle());
    expect(result).not.toBeNull();
    expect(result!.displayTitle).toBe("Israel forces attack border");
  });

  it("article: uses explicit displayTitle when present", () => {
    const result = normalizeEvent(makeArticle({ displayTitle: "Translated headline" }));
    expect(result!.displayTitle).toBe("Translated headline");
  });

  it("article: displayTitle falls back to locationName when title is empty", () => {
    const result = normalizeEvent(makeArticle({ title: "", locationName: "Egypt" }));
    expect(result!.displayTitle).toBe("Egypt event");
  });

  it("article: displayTitle falls back to country when title and locationName are empty", () => {
    const result = normalizeEvent(makeArticle({ title: "", locationName: "", country: "Syria" }));
    expect(result!.displayTitle).toBe("Syria event");
  });

  it("article: final fallback is 'Conflict event'", () => {
    const result = normalizeEvent(makeArticle({ title: "", locationName: "", country: "" }));
    expect(result!.displayTitle).toBe("Conflict event");
  });

  it("hotspot: displayTitle uses title", () => {
    const result = normalizeEvent(makeHotspot());
    expect(result!.displayTitle).toBe("Hotspot: Cairo");
  });

  it("hotspot: falls back to 'X hotspot' from locationName", () => {
    const result = normalizeEvent(makeHotspot({ title: "", locationName: "Cairo" }));
    expect(result!.displayTitle).toBe("Cairo hotspot");
  });

  it("hotspot: final fallback is 'Conflict hotspot'", () => {
    const result = normalizeEvent(makeHotspot({ title: "", locationName: "", country: "" }));
    expect(result!.displayTitle).toBe("Conflict hotspot");
  });

  it("topArticles default to empty array when missing", () => {
    const result = normalizeEvent(makeArticle({ topArticles: undefined }));
    expect(result!.topArticles).toEqual([]);
  });

  it("topArticles are normalized with displayTitle fallback", () => {
    const result = normalizeEvent(
      makeHotspot({
        topArticles: [{ title: "Article without display", url: "https://example.com/a" }],
      })
    );
    expect(result!.topArticles[0]!.displayTitle).toBe("Article without display");
  });

  it("sourceUrl falls back to first topArticle url", () => {
    const result = normalizeEvent(
      makeArticle({ sourceUrl: undefined, topArticles: [{ title: "t", url: "https://fallback.com/url" }] })
    );
    expect(result!.sourceUrl).toBe("https://fallback.com/url");
  });

  it("severityReasons defaults to empty array", () => {
    const result = normalizeEvent(makeArticle({ severityReasons: undefined }));
    expect(result!.severityReasons).toEqual([]);
  });

  it("tags defaults to empty array", () => {
    const result = normalizeEvent(makeArticle({ tags: undefined as unknown as string[] }));
    expect(result!.tags).toEqual([]);
  });

  it("themes defaults to empty array", () => {
    const result = normalizeEvent(makeArticle({ themes: undefined as unknown as string[] }));
    expect(result!.themes).toEqual([]);
  });

  it("id is stringified", () => {
    const result = normalizeEvent({ ...makeArticle(), id: 12345 as unknown as string });
    expect(result!.id).toBe("12345");
  });

  it("wasTranslated and originalTitle set when displayTitle differs from title", () => {
    const result = normalizeEvent(
      makeArticle({
        title: "Original Hebrew text",
        displayTitle: "Translated English text",
        wasTranslated: true,
        translatedFrom: "he",
      })
    );
    expect(result!.wasTranslated).toBe(true);
    expect(result!.translatedFrom).toBe("he");
    expect(result!.originalTitle).toBe("Original Hebrew text");
  });
});

describe("normalizeEvents", () => {
  it("drops features with invalid coordinates", () => {
    const good = makeArticle();
    const bad = makeArticle();
    (bad.geometry as unknown as { coordinates: [] }).coordinates = [];
    const result = normalizeEvents([good, bad]);
    expect(result).toHaveLength(1);
    expect(result[0]!.id).toBe("test-id-1");
  });

  it("returns empty array for empty input", () => {
    expect(normalizeEvents([])).toEqual([]);
  });
});
