import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

import { fetchGdeltConflicts, filterBySeverity } from "@/lib/conflicts/gdelt";
import {
  conflictFeatureCollectionSchema,
  queryParamsSchema,
  type ConflictFeatureCollection,
  type ConflictWindow,
} from "@/lib/conflicts/schema";
import { buildConflictStats } from "@/lib/conflicts/utils";

export const dynamic = "force-dynamic";

const CACHE_TTL_MS: Record<ConflictWindow, number> = {
  "24h": 15 * 60 * 1000,      // 15 minutes
  "7d":  60 * 60 * 1000,      // 1 hour
  "30d": 6 * 60 * 60 * 1000,  // 6 hours
};

function supabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}

type CachedPayload = {
  geojson: ConflictFeatureCollection;
  fetched_at: string;
  source: string;
  ageMs: number;
};

async function readCache(windowValue: ConflictWindow): Promise<CachedPayload | null> {
  try {
    const { data, error } = await supabase()
      .from("conflict_cache")
      .select("fetched_at, source, geojson")
      .eq("window", windowValue)
      .single();

    if (error || !data) return null;

    const parsed = conflictFeatureCollectionSchema.safeParse(data.geojson);
    if (!parsed.success) return null;

    return {
      geojson: parsed.data,
      fetched_at: data.fetched_at as string,
      source: data.source as string,
      ageMs: Date.now() - new Date(data.fetched_at as string).getTime(),
    };
  } catch {
    return null;
  }
}

function writeCache(
  windowValue: ConflictWindow,
  fetched_at: string,
  source: string,
  geojson: ConflictFeatureCollection,
): void {
  supabase()
    .from("conflict_cache")
    .upsert({ window: windowValue, fetched_at, source, geojson })
    .then(({ error }) => {
      if (error) console.error("[conflicts] Cache write failed:", error.message);
    });
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const parsed = queryParamsSchema.safeParse({
    window:   url.searchParams.get("window")   ?? undefined,
    q:        url.searchParams.get("q")        ?? undefined,
    limit:    url.searchParams.get("limit")    ?? undefined,
    severity: url.searchParams.get("severity") ?? undefined,
  });

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid query parameters.", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { limit, q, severity, window } = parsed.data;
  const now = new Date();

  const cache = await readCache(window);
  if (cache && cache.ageMs < CACHE_TTL_MS[window]) {
    const filtered = filterBySeverity(cache.geojson, severity);
    return NextResponse.json(
      {
        meta: {
          window,
          generatedAt: cache.fetched_at,
          source: cache.source,
          count: filtered.features.length,
          cacheAgeSeconds: Math.round(cache.ageMs / 1000),
        },
        stats: buildConflictStats(filtered),
        geojson: filtered,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  }

  const payload = await fetchGdeltConflicts({ limit, now, query: q, window });
  const isLiveData = payload.upstreamSource === "gdelt" && payload.geojson.features.length > 0;

  let geojson: ConflictFeatureCollection;
  let generatedAt: string;
  let source: string;

  if (isLiveData) {
    geojson = payload.geojson;
    generatedAt = payload.generatedAt;
    source = "gdelt";
    writeCache(window, generatedAt, source, geojson);
  } else if (cache) {
    geojson = cache.geojson;
    generatedAt = cache.fetched_at;
    source = cache.source;
  } else {
    geojson = payload.geojson;
    generatedAt = payload.generatedAt;
    source = payload.upstreamSource;
  }

  const filtered = filterBySeverity(geojson, severity);

  return NextResponse.json(
    {
      meta: {
        window,
        generatedAt,
        source,
        count: filtered.features.length,
      },
      stats: buildConflictStats(filtered),
      geojson: filtered,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
