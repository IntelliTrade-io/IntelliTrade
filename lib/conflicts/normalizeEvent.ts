import type { ConflictFeature } from "./schema";

export type NormalizedArticle = {
  title: string;
  displayTitle: string;
  url?: string;
  wasTranslated?: boolean;
  translatedFrom?: string;
};

export type NormalizedEvent = {
  id: string;
  coordinates: [number, number];
  dataKind: "hotspot" | "article";
  title: string;
  displayTitle: string;
  originalTitle?: string;
  wasTranslated?: boolean;
  translatedFrom?: string;
  sourceUrl?: string;
  topArticles: NormalizedArticle[];
  country?: string;
  locationName?: string;
  date?: string;
  severityLabel: "Low" | "Medium" | "High";
  severityScore: number;
  severityReasons: string[];
  tags: string[];
  themes: string[];
  hotspotCount?: number;
  locationPrecision: "exact" | "country";
};

export function normalizeEvent(feature: ConflictFeature): NormalizedEvent | null {
  const p = feature.properties;
  const coords = feature.geometry?.coordinates;
  if (!coords || coords.length < 2 || !Number.isFinite(coords[0]) || !Number.isFinite(coords[1])) {
    return null;
  }

  const rawTitle = p.title ?? "";
  const displayTitle = resolveDisplayTitle(p, rawTitle);

  const topArticles: NormalizedArticle[] = (p.topArticles ?? []).map((a) => ({
    title: a.title ?? rawTitle,
    displayTitle: a.displayTitle ?? a.title ?? rawTitle,
    url: a.url,
    wasTranslated: a.wasTranslated,
    translatedFrom: a.translatedFrom,
  }));

  const sourceUrl = p.sourceUrl ?? topArticles[0]?.url;

  return {
    id: String(feature.id),
    coordinates: [coords[0], coords[1]],
    dataKind: p.dataKind,
    title: rawTitle,
    displayTitle,
    originalTitle: p.wasTranslated && p.displayTitle && p.displayTitle !== rawTitle ? rawTitle : undefined,
    wasTranslated: p.wasTranslated,
    translatedFrom: p.translatedFrom,
    sourceUrl,
    topArticles,
    country: p.country,
    locationName: p.locationName,
    date: p.date,
    severityLabel: p.severityLabel ?? "Low",
    severityScore: typeof p.severityScore === "number" ? p.severityScore : 0,
    severityReasons: p.severityReasons ?? [],
    tags: p.tags ?? [],
    themes: p.themes ?? [],
    hotspotCount: p.hotspotCount,
    locationPrecision: p.locationPrecision ?? "country",
  };
}

function resolveDisplayTitle(
  p: ConflictFeature["properties"],
  rawTitle: string,
): string {
  if (p.displayTitle?.trim()) return p.displayTitle.trim();
  if (rawTitle.trim()) return rawTitle.trim();
  if (p.locationName?.trim()) {
    return p.dataKind === "hotspot"
      ? `${p.locationName.trim()} hotspot`
      : `${p.locationName.trim()} event`;
  }
  if (p.country?.trim()) {
    return p.dataKind === "hotspot"
      ? `${p.country.trim()} hotspot`
      : `${p.country.trim()} event`;
  }
  return p.dataKind === "hotspot" ? "Conflict hotspot" : "Conflict event";
}

export function normalizeEvents(features: ConflictFeature[]): NormalizedEvent[] {
  return features.flatMap((f) => {
    const e = normalizeEvent(f);
    return e ? [e] : [];
  });
}
