import { promises as fs } from "node:fs";
import path from "node:path";

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { MapView } from "@/components/Map/MapView";
import { getDensityProfile } from "@/components/Map/density";
import {
  getMarkerVisual,
  projectConflictMarkers
} from "@/components/Map/hotspots";
import {
  createWorldProjection,
  projectCoordinates
} from "@/components/Map/projection";
import type { ConflictFeature, ConflictFeatureCollection } from "@/lib/schema";

function buildFeature(
  overrides?: Partial<ConflictFeature["properties"]>,
  coordinates: [number, number] = [30.5234, 50.4501]
): ConflictFeature {
  return {
    type: "Feature",
    id: overrides?.dataKind === "article" ? "article-1" : "hotspot-1",
    geometry: {
      type: "Point",
      coordinates
    },
    properties: {
      dataKind: "hotspot",
      title: "Hotspot: Kyiv",
      date: "2026-03-13T10:45:00.000Z",
      country: "Ukraine",
      locationName: "Kyiv",
      hotspotCount: 12,
      locationPrecision: "exact",
      severityScore: 72,
      severityLabel: "High",
      tags: [],
      themes: [],
      ...overrides
    }
  };
}

describe("Vector world map", () => {
  it("renders from bundled vector data without external basemap config", () => {
    const data: ConflictFeatureCollection = {
      type: "FeatureCollection",
      features: [buildFeature()]
    };

    const markup = renderToStaticMarkup(
      createElement(MapView, {
        data,
        densityEnabled: true,
        onSelect: () => undefined,
        reducedMotion: true,
        selectedFeatureId: null
      })
    );

    expect(markup).toContain("<svg");
    expect(markup).toContain("Bundled vector world conflict map");
  });

  it("adapts density rendering as visible point counts grow", () => {
    expect(getDensityProfile(24)).toEqual({
      filterId: "url(#map-density-glow)",
      opacityScale: 1,
      radiusScale: 1,
      tier: "full"
    });
    expect(getDensityProfile(120)).toEqual({
      filterId: "url(#map-density-glow-lite)",
      opacityScale: 0.78,
      radiusScale: 0.88,
      tier: "balanced"
    });
    expect(getDensityProfile(240)).toEqual({
      filterId: null,
      opacityScale: 0.58,
      radiusScale: 0.72,
      tier: "minimal"
    });
  });

  it("projects lon/lat coordinates into visible SVG space", () => {
    const projection = createWorldProjection(1200, 700);
    const projected = projectCoordinates(projection, [30.5234, 50.4501]);

    expect(projected).not.toBeNull();
    expect(projected?.x).toBeGreaterThan(0);
    expect(projected?.x).toBeLessThan(1200);
    expect(projected?.y).toBeGreaterThan(0);
    expect(projected?.y).toBeLessThan(700);
  });

  it("gives country-level points softer visuals than exact points", () => {
    const exact = getMarkerVisual(
      buildFeature({
        dataKind: "article",
        hotspotCount: undefined,
        severityLabel: "Low",
        severityScore: 28
      }),
      false
    );
    const country = getMarkerVisual(
      buildFeature({
        dataKind: "article",
        hotspotCount: undefined,
        locationPrecision: "country",
        severityLabel: "Low",
        severityScore: 28
      }),
      false
    );

    expect(exact.precisionVariant).toBe("exact");
    expect(country.precisionVariant).toBe("country");
    expect(country.coreOpacity).toBeLessThan(exact.coreOpacity);
    expect(country.radius).toBeGreaterThan(exact.radius);
  });

  it("projects country-level markers without changing selection semantics", () => {
    const projection = createWorldProjection(1200, 700);
    const markers = projectConflictMarkers(
      [
        buildFeature(),
        buildFeature(
          {
            dataKind: "article",
            hotspotCount: undefined,
            locationPrecision: "country",
            severityLabel: "Low",
            severityScore: 28
          },
          [35.5018, 33.8938]
        )
      ],
      projection,
      "article-1"
    );

    const selected = markers.find((marker) => marker.id === "article-1");

    expect(markers).toHaveLength(2);
    expect(selected?.isSelected).toBe(true);
    expect(selected?.precisionVariant).toBe("country");
  });

  it("loads bundled world topology from local app data", async () => {
    const projectionSource = await fs.readFile(
      path.join(process.cwd(), "components/Map/projection.ts"),
      "utf8"
    );

    expect(projectionSource).toContain('from "@/data/world.topo.json"');
  });
});
