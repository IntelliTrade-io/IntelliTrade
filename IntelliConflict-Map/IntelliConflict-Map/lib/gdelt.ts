import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";

import countries from "world-countries";

import {
  conflictFeatureCollectionSchema,
  gdeltDocResponseSchema,
  gdeltGeo2GeoJsonSchema,
  type ConflictFeature,
  type ConflictFeatureCollection,
  type ConflictWindow,
  type GdeltDocArticle,
  type TopArticle
} from "@/lib/schema";
import {
  deriveTags,
  getRecencyBoost,
  scoreHotspotSeverity,
  scoreSeverity
} from "@/lib/scoring";

export const DEFAULT_CONFLICT_QUERY =
  "war OR conflict OR clashes OR artillery OR drone strike OR missile OR bombing OR airstrike OR shelling OR incursion OR insurgent OR militia OR battlefield OR ceasefire OR uprising OR explosion OR attack";

const GEO2_ENDPOINT = "https://api.gdeltproject.org/api/v2/geo/geo";
const DOC_ENDPOINT = "https://api.gdeltproject.org/api/v2/doc/doc";
const DEFAULT_TIMEOUT_MS = Number(process.env.GDELT_REQUEST_TIMEOUT_MS ?? 9000);
const DEFAULT_GEORES = 2;

type FetchConflictsOptions = {
  fetchImpl?: typeof fetch;
  limit: number;
  now?: Date;
  query?: string;
  samplePath?: string;
  window: ConflictWindow;
};

export type NormalizedConflictPayload = {
  generatedAt: string;
  geojson: ConflictFeatureCollection;
  upstreamSource: "gdelt" | "sample";
};

export type GdeltWindowStrategy = "geo2" | "doc";

class UpstreamError extends Error {
  constructor(
    public readonly kind: "unreachable" | "rate_limited" | "invalid",
    message: string
  ) {
    super(message);
  }
}

type CountryMatcher = {
  alias: string;
  country: string;
  coordinates: [number, number];
};

const COUNTRY_MATCHERS: CountryMatcher[] = countries
  .flatMap((country) => {
    if (
      !country.latlng ||
      country.latlng.length !== 2 ||
      !country.name?.common
    ) {
      return [];
    }

    const aliases = new Set(
      [
        country.name.common,
        country.name.official,
        ...(country.altSpellings ?? []),
        country.cca2,
        country.cca3
      ].filter((alias): alias is string => Boolean(alias))
    );

    return [...aliases]
      .filter((alias): alias is string => Boolean(alias))
      .map((alias) => ({
        alias,
        country: country.name!.common!,
        coordinates: [country.latlng![1], country.latlng![0]] as [
          number,
          number
        ]
      }));
  })
  .sort((left, right) => right.alias.length - left.alias.length);

export async function fetchGdeltConflicts(
  options: FetchConflictsOptions
): Promise<NormalizedConflictPayload> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const generatedAt = (options.now ?? new Date()).toISOString();
  const query = buildConflictQuery(options.query);
  const strategy = getWindowStrategy(options.window);

  try {
    const collection =
      strategy === "geo2"
        ? await fetchGdeltGeo2GeoJson({
            fetchImpl,
            limit: options.limit,
            now: options.now,
            query,
            window: options.window
          })
        : await fetchDocFallback({
            fetchImpl,
            limit: options.limit,
            now: options.now,
            query,
            window: options.window
          });

    return {
      generatedAt,
      geojson: collection,
      upstreamSource: "gdelt"
    };
  } catch (error) {
    const failure = error as UpstreamError;

    if (failure.kind === "unreachable") {
      return loadSamplePayload({
        generatedAt,
        samplePath: options.samplePath,
        window: options.window
      });
    }

    return {
      generatedAt,
      geojson: emptyCollection(),
      upstreamSource: "gdelt"
    };
  }
}

export function buildConflictQuery(query?: string) {
  return query?.trim() || DEFAULT_CONFLICT_QUERY;
}

export function getWindowStrategy(window: ConflictWindow): GdeltWindowStrategy {
  return window === "30d" ? "doc" : "geo2";
}

export function filterBySeverity(
  collection: ConflictFeatureCollection,
  severity: "all" | "high" | "medium" | "low"
) {
  if (severity === "all") {
    return collection;
  }

  const target = severity.toLowerCase();

  return {
    type: "FeatureCollection" as const,
    features: collection.features.filter(
      (feature) => feature.properties.severityLabel.toLowerCase() === target
    )
  };
}

export function normalizeDocArticles(
  articles: GdeltDocArticle[],
  options?: {
    limit?: number;
    now?: Date;
  }
) {
  const features: ConflictFeature[] = [];

  for (const article of articles) {
    const dateIso = toIsoDate(article.seendate) ?? new Date().toISOString();
    const resolvedLocation = resolveLocation(
      article.title,
      article.sourcecountry
    );

    if (!resolvedLocation.coordinates) {
      continue;
    }

    const tags = deriveTags(article.title);
    const { severityLabel, severityScore } = scoreSeverity({
      title: article.title,
      dateIso,
      now: options?.now
    });
    const topArticles = buildTopArticles([
      {
        title: article.title,
        url: article.url
      }
    ]);

    const feature = createConflictFeature({
      dataKind: "article",
      coordinates: resolvedLocation.coordinates,
      country: resolvedLocation.country,
      dateIso,
      locationPrecision: "country",
      locationName: resolvedLocation.locationName,
      sourceUrl: article.url,
      tags,
      themes: tags,
      topArticles,
      title: article.title,
      severityLabel,
      severityScore
    });

    features.push(feature);
  }

  return finalizeCollection(features, options?.limit);
}

export async function fetchGdeltGeo2GeoJson(input: {
  fetchImpl: typeof fetch;
  limit: number;
  now?: Date;
  query: string;
  window: ConflictWindow;
}) {
  const searchParams = new URLSearchParams({
    query: input.query,
    mode: "pointdata",
    format: "geojson",
    TIMESPAN: windowToGeoTimespan(input.window),
    MAXPOINTS: String(Math.min(input.limit * 2, 1000)),
    GEORES: String(resolveGeoRes(process.env.GDELT_GEORES))
  });
  const url = `${GEO2_ENDPOINT}?${searchParams.toString()}`;
  const data = await requestJson(url, input.fetchImpl);
  const parsed = gdeltGeo2GeoJsonSchema.safeParse(data);

  if (!parsed.success) {
    throw new UpstreamError(
      "invalid",
      "GDELT GEO 2.0 GeoJSON failed validation."
    );
  }

  const hotspots = parsed.data.features.flatMap((feature) => {
    const properties = feature.properties ?? {};
    const locationName = pickLocationName(properties);
    const dateIso =
      toIsoDate(readString(properties.seendate)) ??
      toIsoDate(readString(properties.date)) ??
      toIsoDate(readString(properties.lastupdate)) ??
      new Date().toISOString();

    if (!locationName) {
      return [];
    }

    const topArticles = buildTopArticles([
      ...extractInlineArticle(properties),
      ...extractStructuredArticles(properties.articles),
      ...extractStructuredArticles(properties.topArticles),
      ...extractArticlesFromPopupHtml(findPopupHtml(properties))
    ]);
    const derivedTagText = topArticles.map((article) => article.title).join(" ");
    const tags = derivedTagText ? deriveTags(derivedTagText) : [];
    const themes = normalizeThemes(properties.themes, tags);
    const hotspotCount = pickHotspotCount(properties);
    const gdeltTone = pickGdeltTone(properties);

    return [
      {
        coordinates: feature.geometry.coordinates,
        country: readString(properties.country),
        dateIso,
        gdeltTone,
        hotspotCount,
        locationName,
        sourceUrl: topArticles[0]?.url,
        tags,
        themes,
        topArticles
      }
    ];
  });

  const maxHotspotCount = Math.max(
    1,
    ...hotspots.map((hotspot) => hotspot.hotspotCount)
  );

  const features = hotspots.map((hotspot) => {
    const { severityLabel, severityScore } = scoreHotspotSeverity({
      hotspotCount: hotspot.hotspotCount,
      gdeltTone: hotspot.gdeltTone,
      maxHotspotCount,
      recencyBoost: getRecencyBoost({
        dateIso: hotspot.dateIso,
        maxBoost: 10,
        now: input.now
      })
    });

    return createConflictFeature({
      dataKind: "hotspot",
      coordinates: hotspot.coordinates,
      country: hotspot.country,
      dateIso: hotspot.dateIso,
      gdeltTone: hotspot.gdeltTone,
      hotspotCount: hotspot.hotspotCount,
      locationPrecision: "exact",
      locationName: hotspot.locationName,
      sourceUrl: hotspot.sourceUrl,
      tags: hotspot.tags,
      themes: hotspot.themes,
      topArticles: hotspot.topArticles,
      title: `Hotspot: ${hotspot.locationName}`,
      severityLabel,
      severityScore
    });
  });

  return finalizeCollection(features, input.limit);
}

async function fetchDocFallback(input: {
  fetchImpl: typeof fetch;
  limit: number;
  now?: Date;
  query: string;
  window: ConflictWindow;
}) {
  const url =
    `${DOC_ENDPOINT}?query=${encodeURIComponent(input.query)}` +
    `&mode=ArtList&format=json&sort=DateDesc&maxrecords=${Math.min(
      input.limit * 2,
      250
    )}` +
    `&timespan=${windowToDocTimespan(input.window)}`;
  const data = await requestJson(url, input.fetchImpl);
  const parsed = gdeltDocResponseSchema.safeParse(data);

  if (!parsed.success) {
    throw new UpstreamError("invalid", "GDELT DOC response failed validation.");
  }

  return normalizeDocArticles(parsed.data.articles, {
    limit: input.limit,
    now: input.now
  });
}

async function requestJson(url: string, fetchImpl: typeof fetch) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

  try {
    const response = await fetchImpl(url, {
      cache: "no-store",
      headers: {
        accept: "application/json"
      },
      signal: controller.signal
    });

    const text = await response.text();

    if (/Please limit requests/i.test(text)) {
      throw new UpstreamError(
        "rate_limited",
        "GDELT rate-limited the request."
      );
    }

    if (!response.ok) {
      const kind = response.status === 429 ? "rate_limited" : "unreachable";
      throw new UpstreamError(
        kind,
        `GDELT request failed with status ${response.status}.`
      );
    }

    try {
      return JSON.parse(text) as unknown;
    } catch {
      throw new UpstreamError("invalid", "Malformed JSON returned by GDELT.");
    }
  } catch (error) {
    if (error instanceof UpstreamError) {
      throw error;
    }

    if ((error as Error).name === "AbortError") {
      throw new UpstreamError("unreachable", "GDELT request timed out.");
    }

    throw new UpstreamError("unreachable", "GDELT request failed.");
  } finally {
    clearTimeout(timeout);
  }
}

export function extractArticlesFromPopupHtml(html?: string): TopArticle[] {
  if (!html) {
    return [];
  }

  const links: TopArticle[] = [];
  const anchorPattern =
    /<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;

  for (const match of html.matchAll(anchorPattern)) {
    const url = match[1]?.trim();
    const title = stripHtml(match[2] ?? "");

    if (!url || !title || !isValidUrl(url)) {
      continue;
    }

    links.push({
      title,
      url
    });
  }

  return buildTopArticles(links);
}

function findPopupHtml(properties: Record<string, unknown>) {
  return (
    readString(properties.popup) ??
    readString(properties.popup_html) ??
    readString(properties.popupHTML) ??
    readString(properties.html) ??
    readString(properties.description)
  );
}

function extractStructuredArticles(input: unknown): TopArticle[] {
  if (!Array.isArray(input)) {
    return [];
  }

  return buildTopArticles(
    input.flatMap((item) => {
      if (!item || typeof item !== "object") {
        return [];
      }

      const article = item as Record<string, unknown>;
      const title = readString(article.title);
      const url = readString(article.url);

      if (!title || !url || !isValidUrl(url)) {
        return [];
      }

      return [
        {
          title,
          url
        }
      ];
    })
  );
}

function extractInlineArticle(properties: Record<string, unknown>): TopArticle[] {
  const title = readString(properties.title);
  const url = readString(properties.sourceurl) ?? readString(properties.url);

  if (!title || !url || !isValidUrl(url)) {
    return [];
  }

  return [
    {
      title,
      url
    }
  ];
}

function buildTopArticles(articles: TopArticle[]) {
  const seen = new Set<string>();
  const normalized: TopArticle[] = [];

  for (const article of articles) {
    const title = article.title.trim();
    const url = article.url.trim();

    if (!title || !url || !isValidUrl(url) || seen.has(url)) {
      continue;
    }

    seen.add(url);
    normalized.push({
      title,
      url
    });

    if (normalized.length === 5) {
      break;
    }
  }

  return normalized;
}

function pickHotspotCount(properties: Record<string, unknown>) {
  const count = pickFirstNumber(properties, [
    "mentions",
    "count",
    "numMentions",
    "totalMentions",
    "sum",
    "value",
    "size"
  ]);

  return Math.max(1, Math.round(count ?? 1));
}

function pickGdeltTone(properties: Record<string, unknown>) {
  return pickFirstNumber(properties, [
    "tone",
    "avgtone",
    "averageTone",
    "gdeltTone"
  ]);
}

function pickLocationName(properties: Record<string, unknown>) {
  return (
    readString(properties.name) ??
    readString(properties.label) ??
    readString(properties.location) ??
    readString(properties.loc) ??
    readString(properties.place) ??
    readString(properties.city) ??
    readString(properties.admin1) ??
    readString(properties.admin2) ??
    readString(properties.country)
  );
}

function pickFirstNumber(
  source: Record<string, unknown>,
  keys: string[]
): number | undefined {
  for (const key of keys) {
    const value = readNumber(source[key]);
    if (typeof value === "number") {
      return value;
    }
  }

  return undefined;
}

function createConflictFeature(input: {
  dataKind: "hotspot" | "article";
  coordinates: [number, number];
  country?: string;
  dateIso: string;
  gdeltTone?: number;
  hotspotCount?: number;
  locationPrecision: "exact" | "country";
  locationName?: string;
  sourceUrl?: string;
  tags: string[];
  themes: string[];
  topArticles?: TopArticle[];
  title: string;
  severityLabel: "Low" | "Medium" | "High";
  severityScore: number;
}): ConflictFeature {
  const topArticles = buildTopArticles(input.topArticles ?? []);
  const sourceUrl = input.sourceUrl ?? topArticles[0]?.url;
  const dedupeId = stableHash(
    [
      input.title,
      input.dateIso,
      input.coordinates[1].toFixed(2),
      input.coordinates[0].toFixed(2),
      sourceUrl ?? ""
    ].join("|")
  );

  return {
    type: "Feature",
    id: dedupeId,
    geometry: {
      type: "Point",
      coordinates: input.coordinates
    },
    properties: {
      dataKind: input.dataKind,
      title: input.title,
      date: input.dateIso,
      country: input.country,
      locationName: input.locationName,
      sourceUrl,
      gdeltTone: input.gdeltTone,
      hotspotCount:
        input.dataKind === "hotspot"
          ? Math.max(1, input.hotspotCount ?? 1)
          : undefined,
      topArticles: topArticles.length > 0 ? topArticles : undefined,
      locationPrecision: input.locationPrecision,
      severityScore: input.severityScore,
      severityLabel: input.severityLabel,
      tags: uniqueStrings(input.tags),
      themes: uniqueStrings(input.themes)
    }
  };
}

function finalizeCollection(features: ConflictFeature[], limit = 180) {
  const deduped = new Map<string, ConflictFeature>();

  for (const feature of features) {
    deduped.set(String(feature.id), feature);
  }

  const collection = {
    type: "FeatureCollection" as const,
    features: [...deduped.values()]
      .sort(
        (left, right) =>
          new Date(right.properties.date).getTime() -
          new Date(left.properties.date).getTime()
      )
      .slice(0, limit)
  };

  return conflictFeatureCollectionSchema.parse(collection);
}

function emptyCollection(): ConflictFeatureCollection {
  return {
    type: "FeatureCollection",
    features: []
  };
}

async function loadSamplePayload(input: {
  generatedAt: string;
  samplePath?: string;
  window: ConflictWindow;
}): Promise<NormalizedConflictPayload> {
  const samplePath =
    input.samplePath ??
    path.join(process.cwd(), "public", "sample", "conflicts.sample.geojson");
  const raw = await fs.readFile(samplePath, "utf8");
  const parsed = conflictFeatureCollectionSchema.parse(JSON.parse(raw));
  const filteredFeatures = parsed.features.filter((feature) =>
    input.window === "30d"
      ? feature.properties.dataKind === "article"
      : feature.properties.dataKind === "hotspot"
  );
  const geojson =
    filteredFeatures.length > 0
      ? conflictFeatureCollectionSchema.parse({
          type: "FeatureCollection",
          features: filteredFeatures
        })
      : parsed;

  return {
    generatedAt: input.generatedAt,
    geojson,
    upstreamSource: "sample"
  };
}

function normalizeThemes(input: unknown, fallback: string[]) {
  if (Array.isArray(input)) {
    return uniqueStrings(
      input.filter((value): value is string => typeof value === "string")
    );
  }

  if (typeof input === "string") {
    return uniqueStrings(
      input
        .split(/[;,|]/)
        .map((theme) => theme.trim())
        .filter(Boolean)
    );
  }

  return fallback;
}

function resolveLocation(title: string, sourceCountry?: string) {
  const matchFromTitle = matchCountry(title);
  if (matchFromTitle) {
    return {
      coordinates: matchFromTitle.coordinates,
      country: matchFromTitle.country,
      locationName: matchFromTitle.country
    };
  }

  const matchFromSource = sourceCountry ? matchCountry(sourceCountry) : null;

  if (matchFromSource) {
    return {
      coordinates: matchFromSource.coordinates,
      country: matchFromSource.country,
      locationName: matchFromSource.country
    };
  }

  return {
    coordinates: undefined,
    country: sourceCountry || undefined,
    locationName: sourceCountry || undefined
  };
}

function matchCountry(text: string) {
  const lowerText = text.toLowerCase();

  for (const matcher of COUNTRY_MATCHERS) {
    if (
      matcher.alias.length <= 2 &&
      lowerText !== matcher.alias.toLowerCase()
    ) {
      continue;
    }

    const pattern = new RegExp(
      `(^|[^a-z])${escapeRegex(matcher.alias.toLowerCase())}([^a-z]|$)`
    );
    if (pattern.test(lowerText)) {
      return matcher;
    }
  }

  return null;
}

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function stableHash(input: string) {
  return createHash("sha256").update(input).digest("hex").slice(0, 16);
}

function readString(input: unknown) {
  return typeof input === "string" && input.trim() ? input.trim() : undefined;
}

function readNumber(input: unknown) {
  if (typeof input === "number" && Number.isFinite(input)) {
    return input;
  }

  if (typeof input === "string" && input.trim()) {
    const parsed = Number(input);
    return Number.isFinite(parsed) ? parsed : undefined;
  }

  return undefined;
}

function isValidUrl(value: string) {
  try {
    new URL(value);
    return true;
  } catch {
    return false;
  }
}

function stripHtml(value: string) {
  return value
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/\s+/g, " ")
    .trim();
}

function uniqueStrings(values: string[]) {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function toIsoDate(value?: string) {
  if (!value) {
    return null;
  }

  if (/^\d{8}T\d{6}Z$/.test(value)) {
    return `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(
      6,
      8
    )}T${value.slice(9, 11)}:${value.slice(11, 13)}:${value.slice(13, 15)}Z`;
  }

  const timestamp = Date.parse(value);
  if (!Number.isNaN(timestamp)) {
    return new Date(timestamp).toISOString();
  }

  return null;
}

function windowToGeoTimespan(window: ConflictWindow) {
  switch (window) {
    case "24h":
      return "1d";
    case "7d":
      return "7d";
    case "30d":
      return "7d";
  }
}

function windowToDocTimespan(window: ConflictWindow) {
  switch (window) {
    case "24h":
      return "24h";
    case "7d":
      return "1week";
    case "30d":
      return "1month";
  }
}

function resolveGeoRes(value?: string) {
  const parsed = Number(value ?? DEFAULT_GEORES);

  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 5) {
    return DEFAULT_GEORES;
  }

  return parsed;
}
