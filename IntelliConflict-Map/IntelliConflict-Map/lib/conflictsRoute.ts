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
import { queryParamsSchema, type ConflictFeature, type ConflictFeatureCollection } from "@/lib/schema";
import { translateBatch } from "@/lib/translation/deepl";
import { buildConflictStats } from "@/lib/utils";

const DEFAULT_TTL_SECONDS = Number(process.env.CACHE_TTL_SECONDS ?? 900);

export type RequestHandlerOptions = {
  cacheAdapter?: CacheAdapter<NormalizedConflictPayload>;
  fetchImpl?: typeof fetch;
  now?: () => Date;
  rateLimiter?: (key: string, now?: number) => RateLimitResult;
  shouldCleanup?: () => boolean;
  skipTranslation?: boolean;
};

// In-memory last-known-good fallback for stale data when upstream fails and cache is cold
const lastKnownGood = new Map<
  string,
  { payload: NormalizedConflictPayload; savedAt: string }
>();

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
  let dataSource: "gdelt" | "sample" | "stale" | "offline" | string = "gdelt";

  if (!payload) {
    let freshPayload: NormalizedConflictPayload | null = null;

    try {
      freshPayload = await fetchGdeltConflicts({
        fetchImpl: options.fetchImpl,
        limit,
        now,
        query: q,
        window
      });
    } catch {
      freshPayload = null;
    }

    const isRealData =
      freshPayload != null &&
      freshPayload.upstreamSource !== "sample" &&
      freshPayload.geojson.features.length > 0;

    const isSampleData =
      freshPayload != null && freshPayload.upstreamSource === "sample";

    if (isRealData) {
      // Translate headlines before caching
      const translated = options.skipTranslation
        ? freshPayload!
        : await applyTranslations(freshPayload!);

      payload = translated;

      // Persist to cache
      try {
        await cacheAdapter.set({
          key: cacheKey,
          payload,
          query: resolvedQuery,
          window
        });
      } catch {
        // Cache failure must not block serving fresh data
      }

      // Update last-known-good
      lastKnownGood.set(window, { payload, savedAt: now.toISOString() });
      dataSource = "gdelt";
    } else {
      // Upstream failed or returned sample/empty — prefer stale real data
      const stale = lastKnownGood.get(window);
      if (stale) {
        payload = stale.payload;
        dataSource = "stale";
      } else if (isSampleData && freshPayload!.geojson.features.length > 0) {
        // Only in development; production disables sample fallback in gdelt.ts
        payload = freshPayload!;
        dataSource = "sample";
      } else {
        // No data at all
        payload = {
          generatedAt: now.toISOString(),
          geojson: { type: "FeatureCollection", features: [] },
          upstreamSource: "gdelt"
        };
        dataSource = "offline";
      }
    }
  } else {
    // Update stale fallback from fresh cache hit
    lastKnownGood.set(window, { payload, savedAt: cachedRecord!.createdAt });
    dataSource = payload.upstreamSource === "sample" ? "sample" : cacheAdapter.name;
  }

  const filtered = filterBySeverity(payload.geojson, severity);
  const source = dataSource;

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

async function applyTranslations(
  payload: NormalizedConflictPayload
): Promise<NormalizedConflictPayload> {
  try {
    const features = payload.geojson.features;

    // Collect all headlines to translate
    const headlineItems: { text: string; sourceLang?: string }[] = [];

    for (const feature of features) {
      if (feature.properties.dataKind === "article") {
        headlineItems.push({ text: feature.properties.title });
      }
      if (feature.properties.topArticles) {
        for (const article of feature.properties.topArticles) {
          headlineItems.push({ text: article.title });
        }
      }
    }

    if (headlineItems.length === 0) return payload;

    const translations = await translateBatch(headlineItems);

    const translatedFeatures: ConflictFeature[] = features.map((feature) => {
      const articleTranslation =
        feature.properties.dataKind === "article"
          ? translations.get(feature.properties.title)
          : undefined;

      const translatedTopArticles = feature.properties.topArticles?.map(
        (article) => {
          const t = translations.get(article.title);
          if (!t || !t.wasTranslated) return article;
          return {
            ...article,
            displayTitle: t.displayTitle,
            wasTranslated: true,
            translatedFrom: t.translatedFrom
          };
        }
      );

      return {
        ...feature,
        properties: {
          ...feature.properties,
          displayTitle: articleTranslation?.wasTranslated
            ? articleTranslation.displayTitle
            : undefined,
          wasTranslated: articleTranslation?.wasTranslated ?? false,
          translatedFrom: articleTranslation?.translatedFrom,
          topArticles: translatedTopArticles
        }
      };
    });

    const translatedGeojson: ConflictFeatureCollection = {
      type: "FeatureCollection",
      features: translatedFeatures
    };

    return {
      ...payload,
      geojson: translatedGeojson
    };
  } catch {
    // Translation failure must not break the route
    return payload;
  }
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
