import type { ConflictFeatureCollection } from "./schema";

export function buildConflictStats(collection: ConflictFeatureCollection) {
  const countryCounter = new Map<string, number>();
  const themeCounter = new Map<string, number>();
  const severityBuckets = { low: 0, medium: 0, high: 0 };

  for (const feature of collection.features) {
    const country = feature.properties.country?.trim() || "Unknown";
    const weight =
      feature.properties.dataKind === "hotspot"
        ? (feature.properties.hotspotCount ?? 1)
        : 1;
    countryCounter.set(country, (countryCounter.get(country) ?? 0) + weight);

    const themes = feature.properties.themes?.length
      ? feature.properties.themes
      : feature.properties.tags ?? [];
    for (const theme of themes) {
      themeCounter.set(theme, (themeCounter.get(theme) ?? 0) + 1);
    }

    const severityKey = String(feature.properties.severityLabel || "Low").toLowerCase() as
      | "low"
      | "medium"
      | "high";
    if (severityKey in severityBuckets) {
      severityBuckets[severityKey] += 1;
    }
  }

  return {
    topCountries: [...countryCounter.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, 5)
      .map(([name, count]) => ({ name, count })),
    topThemes: [...themeCounter.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, 5)
      .map(([name, count]) => ({ name, count })),
    severityBuckets,
  };
}
