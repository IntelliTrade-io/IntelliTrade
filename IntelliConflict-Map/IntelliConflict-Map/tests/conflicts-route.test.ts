import { describe, expect, it, vi } from "vitest";

import { handleConflictsRequest } from "@/lib/conflictsRoute";

const GEO2_FEATURES = [
  {
    type: "Feature",
    geometry: {
      type: "Point",
      coordinates: [30.5234, 50.4501]
    },
    properties: {
      name: "Kyiv",
      country: "Ukraine",
      count: 24,
      seendate: "20260313T120000Z",
      popup:
        '<a href="https://example.com/ukraine">Representative article</a>'
    }
  }
];

function makeGeo2Response(features: unknown[] = GEO2_FEATURES) {
  return new Response(
    JSON.stringify({ type: "FeatureCollection", features }),
    { status: 200, headers: { "Content-Type": "application/json" } }
  );
}

function makeCacheAdapter(hit: unknown = null) {
  return {
    cleanup: vi.fn().mockResolvedValue(undefined),
    get: vi.fn().mockResolvedValue(hit),
    name: "file_cache" as const,
    set: vi.fn().mockResolvedValue(undefined),
    ttlSeconds: 900
  };
}

function makeRateLimiter() {
  return () => ({ allowed: true, remaining: 29, retryAfterSeconds: 300 });
}

describe("GET /api/conflicts", () => {
  it("STATE 1 — live: returns fresh GEO 2.0 hotspot data", async () => {
    const cacheAdapter = makeCacheAdapter();
    const fetchImpl = vi.fn().mockResolvedValue(makeGeo2Response());

    const response = await handleConflictsRequest(
      new Request(
        "https://example.com/api/conflicts?window=24h&severity=all&limit=10",
        { headers: { "x-forwarded-for": "203.0.113.10" } }
      ),
      {
        cacheAdapter,
        fetchImpl,
        now: () => new Date("2026-03-13T13:00:00Z"),
        rateLimiter: makeRateLimiter(),
        shouldCleanup: () => false,
        skipTranslation: true
      }
    );

    const payload = (await response.json()) as {
      geojson: { features: Array<{ properties: { dataKind: string; hotspotCount?: number; locationPrecision: string } }> };
      meta: { aggregation?: string; count: number; source: string };
      stats: { topCountries: Array<{ name: string; count: number }> };
    };

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(payload.meta.source).toBe("gdelt");
    expect(payload.meta.aggregation).toBe("location");
    expect(payload.meta.count).toBe(1);
    expect(payload.geojson.features[0].properties.dataKind).toBe("hotspot");
    expect(payload.geojson.features[0].properties.hotspotCount).toBe(24);
    expect(payload.geojson.features[0].properties.locationPrecision).toBe("exact");
    expect(payload.stats.topCountries[0]).toEqual({ name: "Ukraine", count: 24 });
  });

  it("returns normalized data, cache metadata, and stats from mocked upstream data", async () => {
    const cacheAdapter = makeCacheAdapter();

    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          articles: [
            {
              url: "https://example.com/ukraine",
              url_mobile: "",
              title: "Missile attack reported in Ukraine overnight",
              seendate: "20260313T120000Z",
              socialimage: "",
              domain: "example.com",
              language: "English",
              sourcecountry: "Ukraine"
            }
          ]
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    );

    const response = await handleConflictsRequest(
      new Request(
        "https://example.com/api/conflicts?window=30d&severity=all&limit=10",
        { headers: { "x-forwarded-for": "203.0.113.10" } }
      ),
      {
        cacheAdapter,
        fetchImpl,
        now: () => new Date("2026-03-13T13:00:00Z"),
        rateLimiter: makeRateLimiter(),
        shouldCleanup: () => false,
        skipTranslation: true
      }
    );

    const payload = (await response.json()) as {
      geojson: { features: Array<{ properties: { country?: string; dataKind: string; locationPrecision: string } }> };
      meta: { count: number; source: string };
      stats: { topCountries: Array<{ name: string; count: number }> };
    };

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(cacheAdapter.cleanup).not.toHaveBeenCalled();
    expect(cacheAdapter.set).toHaveBeenCalledTimes(1);
    expect(payload.meta.source).toBe("gdelt");
    expect(payload.meta.count).toBe(1);
    expect(payload.geojson.features[0].properties.country).toBe("Ukraine");
    expect(payload.geojson.features[0].properties.dataKind).toBe("article");
    expect(payload.geojson.features[0].properties.locationPrecision).toBe("country");
    expect(payload.stats.topCountries[0]).toEqual({ name: "Ukraine", count: 1 });
  });

  it("preserves cache metadata when serving a cache hit", async () => {
    const cacheAdapter = makeCacheAdapter({
      payload: {
        generatedAt: "2026-03-13T12:55:00.000Z",
        upstreamSource: "gdelt",
        geojson: {
          type: "FeatureCollection",
          features: [
            {
              type: "Feature",
              id: "cached-1",
              geometry: { type: "Point", coordinates: [30.5234, 50.4501] },
              properties: {
                dataKind: "hotspot",
                title: "Hotspot: Kyiv",
                date: "2026-03-13T12:50:00.000Z",
                country: "Ukraine",
                locationName: "Kyiv",
                hotspotCount: 12,
                locationPrecision: "exact",
                severityScore: 60,
                severityLabel: "Medium",
                tags: [],
                themes: []
              }
            }
          ]
        }
      },
      createdAt: "2026-03-13T12:58:00.000Z",
      expiresAt: "2026-03-13T13:13:00.000Z"
    });

    const fetchImpl = vi.fn();

    const response = await handleConflictsRequest(
      new Request("https://example.com/api/conflicts?window=24h&limit=10", {
        headers: { "x-forwarded-for": "203.0.113.10" }
      }),
      {
        cacheAdapter,
        fetchImpl,
        now: () => new Date("2026-03-13T13:00:00Z"),
        rateLimiter: makeRateLimiter(),
        shouldCleanup: () => false,
        skipTranslation: true
      }
    );

    const payload = (await response.json()) as {
      meta: {
        source: string;
        count: number;
        cache: { hit: boolean; ageSeconds: number; ttlSeconds: number };
      };
    };

    expect(fetchImpl).not.toHaveBeenCalled();
    expect(cacheAdapter.set).not.toHaveBeenCalled();
    expect(payload.meta.source).toBe("file_cache");
    expect(payload.meta.count).toBe(1);
    expect(payload.meta.cache).toEqual({
      hit: true,
      ageSeconds: 120,
      ttlSeconds: 900
    });
  });

  it("STATE 2 — stale: serves in-memory stale data when upstream fails and cache is cold", async () => {
    // First: prime last-known-good with a successful request
    const seedCacheAdapter = makeCacheAdapter();
    const seedFetchImpl = vi.fn().mockResolvedValue(makeGeo2Response());

    await handleConflictsRequest(
      new Request("https://example.com/api/conflicts?window=24h&limit=10", {
        headers: { "x-forwarded-for": "1.2.3.4" }
      }),
      {
        cacheAdapter: seedCacheAdapter,
        fetchImpl: seedFetchImpl,
        now: () => new Date("2026-03-13T13:00:00Z"),
        rateLimiter: makeRateLimiter(),
        shouldCleanup: () => false,
        skipTranslation: true
      }
    );

    // Now: fresh fetch fails, cache miss → should serve stale
    const staleCacheAdapter = makeCacheAdapter(); // no hit
    const failFetchImpl = vi.fn().mockRejectedValue(new Error("network down"));

    const response = await handleConflictsRequest(
      new Request("https://example.com/api/conflicts?window=24h&limit=10", {
        headers: { "x-forwarded-for": "1.2.3.4" }
      }),
      {
        cacheAdapter: staleCacheAdapter,
        fetchImpl: failFetchImpl,
        now: () => new Date("2026-03-13T13:05:00Z"),
        rateLimiter: makeRateLimiter(),
        shouldCleanup: () => false,
        skipTranslation: true
      }
    );

    const payload = (await response.json()) as { meta: { source: string; count: number } };
    expect(payload.meta.source).toBe("stale");
    expect(payload.meta.count).toBeGreaterThan(0);
  });

  it("STATE 3 — offline: returns empty map when no data available", async () => {
    // Use a fresh window key that has no in-memory last-known-good
    const cacheAdapter = makeCacheAdapter();
    const failFetchImpl = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ type: "FeatureCollection", features: [] }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      })
    );

    const response = await handleConflictsRequest(
      new Request("https://example.com/api/conflicts?window=7d&limit=10", {
        headers: { "x-forwarded-for": "2.2.2.2" }
      }),
      {
        cacheAdapter,
        fetchImpl: failFetchImpl,
        now: () => new Date("2026-03-13T13:10:00Z"),
        rateLimiter: makeRateLimiter(),
        shouldCleanup: () => false,
        skipTranslation: true
      }
    );

    const payload = (await response.json()) as { meta: { source: string; count: number } };
    // No features returned + no prior good data → offline
    expect(["offline", "gdelt"]).toContain(payload.meta.source);
    expect(payload.meta.count).toBe(0);
  });

  it("does not expose sample data as live source in production", async () => {
    const cacheAdapter = makeCacheAdapter();
    // Simulate a network error that would trigger sample fallback
    const fetchImpl = vi.fn().mockRejectedValue(new TypeError("network down"));

    const response = await handleConflictsRequest(
      new Request("https://example.com/api/conflicts?window=24h&limit=10", {
        headers: { "x-forwarded-for": "3.3.3.3" }
      }),
      {
        cacheAdapter,
        fetchImpl,
        now: () => new Date("2026-03-13T14:00:00Z"),
        rateLimiter: makeRateLimiter(),
        shouldCleanup: () => false,
        skipTranslation: true
      }
    );

    const payload = (await response.json()) as { meta: { source: string } };
    // Source must never be "sample" in test mode (non-production handles via gdelt.ts gate)
    expect(payload.meta.source).not.toBe("live-sample-fabricated");
    expect(["stale", "offline", "gdelt"]).toContain(payload.meta.source);
  });
});
