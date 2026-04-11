import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { RightDrawer } from "@/components/Panels/RightDrawer";
import type { ConflictFeature } from "@/lib/schema";

function buildHotspotFeature(
  overrides?: Partial<ConflictFeature["properties"]>
): ConflictFeature {
  return {
    type: "Feature",
    id: "hotspot-1",
    geometry: {
      type: "Point",
      coordinates: [30.5234, 50.4501]
    },
    properties: {
      dataKind: "hotspot",
      title: "Hotspot: Kyiv",
      date: "2026-03-13T10:45:00.000Z",
      country: "Ukraine",
      locationName: "Kyiv",
      hotspotCount: 42,
      topArticles: [
        {
          title: "Representative story",
          url: "https://example.com/story"
        }
      ],
      locationPrecision: "exact",
      severityScore: 82,
      severityLabel: "High",
      tags: ["Airstrikes"],
      themes: ["Airstrikes"],
      ...overrides
    }
  };
}

function buildArticleFeature(
  overrides?: Partial<ConflictFeature["properties"]>
): ConflictFeature {
  return {
    type: "Feature",
    id: "article-1",
    geometry: {
      type: "Point",
      coordinates: [35.5018, 33.8938]
    },
    properties: {
      dataKind: "article",
      title: "Ceasefire talks resume after overnight strike exchange",
      date: "2026-03-13T06:30:00.000Z",
      country: "Lebanon",
      locationName: "Lebanon",
      sourceUrl: "https://example.com/article",
      locationPrecision: "country",
      severityScore: 28,
      severityLabel: "Low",
      tags: ["Diplomacy"],
      themes: ["Diplomacy"],
      ...overrides
    }
  };
}

describe("RightDrawer", () => {
  it("renders hotspot top articles without an open-source button", () => {
    const markup = renderToStaticMarkup(
      createElement(RightDrawer, {
        feature: buildHotspotFeature(),
        onClose: () => undefined,
        windowValue: "24h"
      })
    );

    expect(markup).toContain("Hotspot");
    expect(markup).toContain("Mentions 42");
    expect(markup).toContain("Top articles");
    expect(markup).toContain("Showing a few representative articles");
    expect(markup).toContain("Representative story");
    expect(markup).not.toContain("Open source");
  });

  it("renders a hotspot fallback note when representative articles are unavailable", () => {
    const markup = renderToStaticMarkup(
      createElement(RightDrawer, {
        feature: buildHotspotFeature({ topArticles: undefined }),
        onClose: () => undefined,
        windowValue: "24h"
      })
    );

    expect(markup).toContain(
      "Aggregated hotspot (no direct article links in this view)"
    );
  });

  it("renders article controls when a source URL is available", () => {
    const markup = renderToStaticMarkup(
      createElement(RightDrawer, {
        feature: buildArticleFeature(),
        onClose: () => undefined,
        windowValue: "30d"
      })
    );

    expect(markup).toContain("Article-derived signal");
    expect(markup).toContain("Open source");
    expect(markup).toContain("Approximate location (country-level)");
  });
});
