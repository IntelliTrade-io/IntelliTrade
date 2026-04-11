import path from "node:path";

import { describe, expect, it, vi } from "vitest";

import {
  fetchGdeltConflicts,
  getWindowStrategy,
  normalizeDocArticles
} from "@/lib/gdelt";

describe("normalizeDocArticles", () => {
  it("selects GEO 2.0 for 24h and 7d, and DOC for 30d", () => {
    expect(getWindowStrategy("24h")).toBe("geo2");
    expect(getWindowStrategy("7d")).toBe("geo2");
    expect(getWindowStrategy("30d")).toBe("doc");
  });

  it("normalizes DOC results and de-duplicates duplicate events", () => {
    const collection = normalizeDocArticles(
      [
        {
          url: "https://example.com/a",
          url_mobile: "",
          title: "Missile attack reported in Ukraine overnight",
          seendate: "20260313T120000Z",
          socialimage: "",
          domain: "example.com",
          language: "English",
          sourcecountry: "Ukraine"
        },
        {
          url: "https://example.com/a",
          url_mobile: "",
          title: "Missile attack reported in Ukraine overnight",
          seendate: "20260313T120000Z",
          socialimage: "",
          domain: "example.com",
          language: "English",
          sourcecountry: "Ukraine"
        },
        {
          url: "https://example.com/b",
          url_mobile: "",
          title: "Ceasefire talks continue in Lebanon after strike exchange",
          seendate: "20260313T080000Z",
          socialimage: "",
          domain: "example.com",
          language: "English",
          sourcecountry: "Lebanon"
        }
      ],
      {
        now: new Date("2026-03-13T13:00:00Z")
      }
    );

    expect(collection.features).toHaveLength(2);
    expect(collection.features[0].properties.country).toBe("Ukraine");
    expect(collection.features[0].properties.locationPrecision).toBe("country");
    expect(collection.features[0].properties.severityLabel).toBe("Medium");
    expect(collection.features[1].properties.tags).toContain("Diplomacy");
  });

  it("uses GEO 2.0 GeoJSON for short windows without DOC fallback", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          type: "FeatureCollection",
          features: [
            {
              type: "Feature",
              geometry: {
                type: "Point",
                coordinates: [30.5234, 50.4501]
              },
              properties: {
                title: "Airstrike reported near Kyiv",
                url: "https://example.com/geo2",
                seendate: "20260313T120000Z",
                country: "Ukraine",
                loc: "Kyiv"
              }
            }
          ]
        }),
        {
          status: 200,
          headers: {
            "Content-Type": "application/json"
          }
        }
      )
    );

    const result = await fetchGdeltConflicts({
      fetchImpl,
      limit: 10,
      window: "24h"
    });

    expect(fetchImpl).toHaveBeenCalledTimes(1);

    const requestUrl = new URL(fetchImpl.mock.calls[0][0] as string);
    expect(requestUrl.origin + requestUrl.pathname).toBe(
      "https://api.gdeltproject.org/api/v2/geo/geo"
    );
    expect(requestUrl.searchParams.get("mode")).toBe("pointdata");
    expect(requestUrl.searchParams.get("format")).toBe("geojson");
    expect(requestUrl.searchParams.get("TIMESPAN")).toBe("1d");
    expect(requestUrl.searchParams.get("GEORES")).toBe("2");
    expect(result.geojson.features[0].properties.locationPrecision).toBe(
      "exact"
    );
  });

  it("normalizes GEO 2.0 pointdata as hotspots with representative articles", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          type: "FeatureCollection",
          features: [
            {
              type: "Feature",
              geometry: {
                type: "Point",
                coordinates: [30.5234, 50.4501]
              },
              properties: {
                name: "Kyiv",
                country: "Ukraine",
                count: 5,
                avgtone: -2.5,
                seendate: "20260313T120000Z",
                popup:
                  '<a href="https://example.com/1">Story One</a>' +
                  '<a href="https://example.com/2">Story Two</a>' +
                  '<a href="https://example.com/3">Story Three</a>' +
                  '<a href="https://example.com/4">Story Four</a>' +
                  '<a href="https://example.com/5">Story Five</a>' +
                  '<a href="https://example.com/6">Story Six</a>'
              }
            },
            {
              type: "Feature",
              geometry: {
                type: "Point",
                coordinates: [36.2765, 33.5138]
              },
              properties: {
                name: "Damascus",
                country: "Syria",
                mentions: 100,
                avgtone: -6.2,
                seendate: "20260313T120000Z",
                popup:
                  '<a href="https://example.com/damascus">Lead article</a>'
              }
            },
            {
              type: "Feature",
              geometry: {
                type: "Point",
                coordinates: [30.7233, 46.4825]
              },
              properties: {
                name: "Odesa",
                country: "Ukraine",
                count: 12,
                seendate: "20260313T120000Z"
              }
            },
            {
              type: "Feature",
              geometry: {
                type: "Point",
                coordinates: [37.1612, 36.2021]
              },
              properties: {
                label: "Aleppo Governorate",
                country: "Syria",
                count: 8,
                seendate: "20260313T120000Z"
              }
            }
          ]
        }),
        {
          status: 200,
          headers: {
            "Content-Type": "application/json"
          }
        }
      )
    );

    const result = await fetchGdeltConflicts({
      fetchImpl,
      limit: 10,
      now: new Date("2026-03-13T13:00:00Z"),
      window: "24h"
    });

    const kyiv = result.geojson.features.find(
      (feature) => feature.properties.locationName === "Kyiv"
    );
    const damascus = result.geojson.features.find(
      (feature) => feature.properties.locationName === "Damascus"
    );
    const odesa = result.geojson.features.find(
      (feature) => feature.properties.locationName === "Odesa"
    );
    const aleppo = result.geojson.features.find(
      (feature) => feature.properties.locationName === "Aleppo Governorate"
    );

    expect(kyiv?.properties.dataKind).toBe("hotspot");
    expect(kyiv?.properties.hotspotCount).toBe(5);
    expect(kyiv?.properties.topArticles).toHaveLength(5);
    expect(kyiv?.properties.sourceUrl).toBe("https://example.com/1");

    expect(damascus?.properties.hotspotCount).toBe(100);
    expect(damascus?.properties.severityScore).toBeGreaterThan(
      kyiv?.properties.severityScore ?? 0
    );

    expect(odesa?.properties.topArticles).toBeUndefined();
    expect(odesa?.properties.sourceUrl).toBeUndefined();
    expect(odesa?.properties.locationPrecision).toBe("exact");
    expect(aleppo?.properties.locationName).toBe("Aleppo Governorate");
  });

  it("returns empty GEO data when rate-limited instead of switching to sample", async () => {
    const result = await fetchGdeltConflicts({
      fetchImpl: async () =>
        new Response("Please limit requests to one every 5 seconds.", {
          status: 200
        }),
      limit: 10,
      window: "24h"
    });

    expect(result.upstreamSource).toBe("gdelt");
    expect(result.geojson.features).toHaveLength(0);
  });

  it("falls back to sample data when upstream is unreachable", async () => {
    const result = await fetchGdeltConflicts({
      fetchImpl: async () => {
        throw new TypeError("network down");
      },
      limit: 10,
      samplePath: path.join(
        process.cwd(),
        "public",
        "sample",
        "conflicts.sample.geojson"
      ),
      window: "30d"
    });

    expect(result.upstreamSource).toBe("sample");
    expect(result.geojson.features.length).toBeGreaterThan(0);
  });
});
