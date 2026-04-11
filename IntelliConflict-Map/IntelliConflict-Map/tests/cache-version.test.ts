import { afterEach, describe, expect, it, vi } from "vitest";

const CACHE_MODULE = "@/lib/cache";
const VERSION_MODULE = "@/lib/cache/version";

afterEach(() => {
  vi.resetModules();
  vi.doUnmock(VERSION_MODULE);
  vi.doUnmock(CACHE_MODULE);
});

describe("cache key schema versioning", () => {
  it("changes the cache key when the schema version changes", async () => {
    vi.doMock(VERSION_MODULE, () => ({
      CACHE_SCHEMA_VERSION: "4"
    }));
    const { buildCacheKey: buildV4 } = await import(CACHE_MODULE);
    const v4Key = buildV4({
      window: "24h",
      query: "war",
      limit: 10
    });

    vi.resetModules();
    vi.doMock(VERSION_MODULE, () => ({
      CACHE_SCHEMA_VERSION: "5"
    }));
    const { buildCacheKey: buildV5 } = await import(CACHE_MODULE);
    const v5Key = buildV5({
      window: "24h",
      query: "war",
      limit: 10
    });

    expect(v5Key).not.toBe(v4Key);
    expect(v4Key).toContain("conflicts_4_24h_");
    expect(v5Key).toContain("conflicts_5_24h_");
  });
});
