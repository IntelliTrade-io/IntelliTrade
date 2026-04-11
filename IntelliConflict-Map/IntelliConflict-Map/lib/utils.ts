import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

import type {
  ConflictFeature,
  ConflictFeatureCollection,
  ConflictStats,
  SeverityLabel
} from "@/lib/schema";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

export function buildConflictStats(
  input: ConflictFeature[] | ConflictFeatureCollection
): ConflictStats {
  const features = Array.isArray(input) ? input : input.features;
  const countryCounter = new Map<string, number>();
  const themeCounter = new Map<string, number>();
  const severityBuckets: ConflictStats["severityBuckets"] = {
    low: 0,
    medium: 0,
    high: 0
  };

  for (const feature of features) {
    const country = feature.properties.country?.trim() || "Unknown";
    const countryWeight =
      feature.properties.dataKind === "hotspot"
        ? feature.properties.hotspotCount ?? 1
        : 1;
    countryCounter.set(
      country,
      (countryCounter.get(country) ?? 0) + countryWeight
    );

    const themes =
      feature.properties.themes.length > 0
        ? feature.properties.themes
        : feature.properties.tags;

    for (const theme of themes) {
      themeCounter.set(theme, (themeCounter.get(theme) ?? 0) + 1);
    }

    const label =
      feature.properties.severityLabel.toLowerCase() as Lowercase<SeverityLabel>;
    severityBuckets[label] += 1;
  }

  return {
    topCountries: [...countryCounter.entries()]
      .sort(
        (left, right) => right[1] - left[1] || left[0].localeCompare(right[0])
      )
      .slice(0, 5)
      .map(([name, count]) => ({ name, count })),
    topThemes: [...themeCounter.entries()]
      .sort(
        (left, right) => right[1] - left[1] || left[0].localeCompare(right[0])
      )
      .slice(0, 5)
      .map(([name, count]) => ({ name, count })),
    severityBuckets
  };
}

export function formatRelativeTime(isoString: string, now = new Date()) {
  const target = new Date(isoString);
  const diffMs = target.getTime() - now.getTime();
  const diffMinutes = Math.round(diffMs / 60000);
  const formatter = new Intl.RelativeTimeFormat("en", { numeric: "auto" });

  if (Math.abs(diffMinutes) < 60) {
    return formatter.format(diffMinutes, "minute");
  }

  const diffHours = Math.round(diffMinutes / 60);
  if (Math.abs(diffHours) < 24) {
    return formatter.format(diffHours, "hour");
  }

  const diffDays = Math.round(diffHours / 24);
  if (Math.abs(diffDays) < 30) {
    return formatter.format(diffDays, "day");
  }

  return formatter.format(Math.round(diffDays / 30), "month");
}

export function formatTimestamp(isoString: string) {
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(isoString));
}

export function matchesSearch(feature: ConflictFeature, searchTerm: string) {
  if (!searchTerm.trim()) {
    return true;
  }

  const needle = searchTerm.trim().toLowerCase();
  const haystack = [
    feature.properties.title,
    feature.properties.country,
    feature.properties.locationName,
    feature.properties.tags.join(" "),
    feature.properties.themes.join(" "),
    feature.properties.topArticles?.map((article) => article.title).join(" ")
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return haystack.includes(needle);
}

export function percentage(value: number, total: number) {
  if (total <= 0) {
    return 0;
  }

  return (value / total) * 100;
}
