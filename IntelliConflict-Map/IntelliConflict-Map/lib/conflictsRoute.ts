import { NextResponse } from "next/server";

import {
  buildCacheKey,
  selectCacheAdapter,
  shouldCleanup as shouldCleanupCache,
  type CacheAdapter
} from "@/lib/cache";
import {
  buildConflictQuery,
  fetchGdeltConflicts,
  filterBySeverity,
  type NormalizedConflictPayload
} from "@/lib/gdelt";
import { checkConflictsRateLimit, type RateLimitResult } from "@/lib/rateLimit";
import { queryParamsSchema } from "@/lib/schema";
import { buildConflictStats } from "@/lib/utils";

const DEFAULT_TTL_SECONDS = Number(process.env.CACHE_TTL_SECONDS ?? 900);

export type RequestHandlerOptions = {
  cacheAdapter?: CacheAdapter<NormalizedConflictPayload>;
  fetchImpl?: typeof fetch;
  now?: () => Date;
  rateLimiter?: (key: string, now?: number) => RateLimitResult;
  shouldCleanup?: () => boolean;
};

export async function handleConflictsRequest(
  request: Request,
  options: RequestHandlerOptions = {}
) {
  const url = new URL(request.url);
  const parsedParams = queryParamsSchema.safeParse({
    window: url.searchParams.get("window") ?? undefined,
    q: url.searchParams.get("q") ?? undefined,
    limit: url.searchParams.get("limit") ?? undefined,
    severity: url.searchParams.get("severity") ?? undefined
  });

  if (!parsedParams.success) {
    return NextResponse.json(
      {
        error: "Invalid query parameters.",
        issues: parsedParams.error.flatten()
      },
      {
        status: 400
      }
    );
  }

  const now = options.now?.() ?? new Date();
  const clientIp = getClientIp(request.headers);
  const rateLimiter = options.rateLimiter ?? checkConflictsRateLimit;
  const rateLimit = rateLimiter(clientIp, now.getTime());

  if (!rateLimit.allowed) {
    return NextResponse.json(
      {
        error: "Rate limit exceeded.",
        retryAfterSeconds: rateLimit.retryAfterSeconds
      },
      {
        status: 429,
        headers: {
          "Retry-After": String(rateLimit.retryAfterSeconds)
        }
      }
    );
  }

  const { limit, q, severity, window } = parsedParams.data;
  const resolvedQuery = buildConflictQuery(q);
  const cacheKey = buildCacheKey({
    window,
    query: resolvedQuery,
    limit
  });

  const cacheAdapter =
    options.cacheAdapter ??
    selectCacheAdapter<NormalizedConflictPayload>({
      ttlSeconds: DEFAULT_TTL_SECONDS
    });

  let cachedRecord: Awaited<
    ReturnType<CacheAdapter<NormalizedConflictPayload>["get"]>
  > | null = null;

  try {
    if ((options.shouldCleanup ?? shouldCleanupCache)()) {
      await cacheAdapter.cleanup();
    }
    cachedRecord = await cacheAdapter.get(cacheKey);
  } catch {
    cachedRecord = null;
  }

  let payload = cachedRecord?.payload;
  if (!payload) {
    payload = await fetchGdeltConflicts({
      fetchImpl: options.fetchImpl,
      limit,
      now,
      query: q,
      window
    });

    try {
      await cacheAdapter.set({
        key: cacheKey,
        payload,
        query: resolvedQuery,
        window
      });
    } catch {
      // Cache failure should not block fresh data.
    }
  }

  const filtered = filterBySeverity(payload.geojson, severity);
  const source =
    payload.upstreamSource === "sample"
      ? "sample"
      : cachedRecord
        ? cacheAdapter.name
        : "gdelt";

  return NextResponse.json(
    {
      meta: {
        window,
        generatedAt: payload.generatedAt,
        source,
        aggregation: resolveAggregation(payload.geojson.features, window),
        count: filtered.features.length,
        cache: {
          hit: Boolean(cachedRecord),
          ageSeconds: cachedRecord
            ? Math.max(
                0,
                Math.floor(
                  (now.getTime() - new Date(cachedRecord.createdAt).getTime()) /
                    1000
                )
              )
            : 0,
          ttlSeconds: cacheAdapter.ttlSeconds
        }
      },
      stats: buildConflictStats(filtered),
      geojson: filtered
    },
    {
      headers: {
        "Cache-Control": "no-store"
      }
    }
  );
}

function getClientIp(headers: Headers) {
  const forwardedFor = headers.get("x-forwarded-for");
  if (forwardedFor) {
    return forwardedFor.split(",")[0].trim();
  }

  return headers.get("cf-connecting-ip") ?? headers.get("x-real-ip") ?? "local";
}

function resolveAggregation(
  features: NormalizedConflictPayload["geojson"]["features"],
  window: "24h" | "7d" | "30d"
) {
  const dataKinds = new Set(features.map((feature) => feature.properties.dataKind));

  if (dataKinds.size === 0) {
    return window === "30d" ? "article" : "location";
  }

  if (dataKinds.size === 1) {
    return dataKinds.has("hotspot") ? "location" : "article";
  }

  return "mixed";
}
