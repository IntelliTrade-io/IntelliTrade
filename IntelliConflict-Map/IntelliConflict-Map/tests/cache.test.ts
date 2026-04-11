import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

import { describe, expect, it, vi } from "vitest";

import { buildCacheKey, selectCacheAdapter, shouldCleanup } from "@/lib/cache";
import { createFileCache } from "@/lib/cache/fileCache";
import { createSupabaseCache } from "@/lib/cache/supabaseCache";
import { CACHE_SCHEMA_VERSION } from "@/lib/cache/version";

describe("cache adapters", () => {
  it("expires filesystem cache entries after TTL", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-13T12:00:00Z"));

    const cacheDir = await fs.mkdtemp(path.join(os.tmpdir(), "icm-cache-"));
    const cache = createFileCache<{ ok: boolean }>({
      cacheDir,
      ttlSeconds: 60
    });
    const key = buildCacheKey({
      window: "24h",
      query: "war",
      limit: 10
    });

    await cache.set({
      key,
      payload: { ok: true },
      query: "war",
      window: "24h"
    });

    expect(await cache.get(key)).toMatchObject({
      payload: { ok: true }
    });

    vi.setSystemTime(new Date("2026-03-13T12:01:01Z"));

    expect(await cache.get(key)).toBeNull();
  });

  it("selects file cache when Supabase is not configured", () => {
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;

    const cache = selectCacheAdapter({
      ttlSeconds: 120
    });

    expect(cache.name).toBe("file_cache");
  });

  it("includes the cache schema version in generated cache keys", () => {
    const key = buildCacheKey({
      window: "24h",
      query: "war",
      limit: 10
    });

    expect(key).toContain(`conflicts_${CACHE_SCHEMA_VERSION}_24h_`);
  });

  it("computes Supabase expiry using the configured TTL", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-13T12:00:00Z"));

    const maybeSingle = vi.fn().mockResolvedValue({
      data: {
        payload: { ok: true },
        created_at: "2026-03-13T12:00:00.000Z",
        expires_at: "2026-03-13T12:02:00.000Z"
      },
      error: null
    });

    const upsert = vi.fn().mockResolvedValue({ error: null });
    const lte = vi.fn().mockResolvedValue({ error: null });
    const gt = vi.fn().mockReturnValue({ maybeSingle });
    const eq = vi.fn().mockReturnValue({ gt });
    const select = vi.fn().mockReturnValue({ eq });
    const remove = vi.fn().mockReturnValue({ lte });
    const from = vi.fn().mockImplementation(() => ({
      delete: remove,
      select,
      upsert
    }));

    const cache = createSupabaseCache<{ ok: boolean }>({
      client: { from } as never,
      ttlSeconds: 120
    });

    await cache.set({
      key: "conflicts_24h_test",
      payload: { ok: true },
      query: "war",
      window: "24h"
    });

    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        cache_key: "conflicts_24h_test",
        expires_at: "2026-03-13T12:02:00.000Z"
      })
    );

    expect(await cache.get("conflicts_24h_test")).toMatchObject({
      payload: { ok: true }
    });
  });

  it("runs cache cleanup probabilistically", () => {
    expect(shouldCleanup(0.01)).toBe(true);
    expect(shouldCleanup(0.9)).toBe(false);
  });
});
