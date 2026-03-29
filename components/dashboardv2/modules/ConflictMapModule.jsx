"use client";

import React, { useEffect, useMemo, useState } from "react";
import { geoGraticule10, geoNaturalEarth1, geoPath } from "d3-geo";
import { feature as topoFeature } from "topojson-client";
import { RotateCw, Search } from "lucide-react";

const VIEWBOX_WIDTH = 1440;
const VIEWBOX_HEIGHT = 900;
const WINDOW_OPTIONS = [
  { label: "24H", value: "24h" },
  { label: "7D", value: "7d" },
  { label: "30D", value: "30d" },
];
const WINDOW_MS = {
  "24h": 24 * 60 * 60 * 1000,
  "7d": 7 * 24 * 60 * 60 * 1000,
  "30d": 30 * 24 * 60 * 60 * 1000,
};
const SEVERITY_OPTIONS = [
  { label: "All", value: "all" },
  { label: "High", value: "high" },
  { label: "Medium", value: "medium" },
  { label: "Low", value: "low" },
];
const CATEGORY_DEFINITIONS = [
  { id: "airstrikes", label: "Airstrikes", keywords: ["airstrike", "air strike", "artillery", "shelling", "bombardment", "bombing"] },
  { id: "ground-clashes", label: "Ground clashes", keywords: ["clash", "clashes", "battlefield", "incursion", "insurgent", "militia", "troops"] },
  { id: "explosions", label: "Explosions", keywords: ["explosion", "blast", "attack", "suicide bombing"] },
  { id: "drones-missiles", label: "Drones/Missiles", keywords: ["drone", "missile", "rocket", "strike"] },
  { id: "diplomacy", label: "Diplomacy", keywords: ["ceasefire", "talks", "negotiation", "negotiations", "truce"] },
];
const severityMeta = {
  high: {
    badge: "border-rose-400/30 bg-rose-400/12 text-rose-100",
    marker: "#ff8dac",
  },
  medium: {
    badge: "border-amber-300/30 bg-amber-300/12 text-amber-100",
    marker: "#ffd676",
  },
  low: {
    badge: "border-emerald-400/30 bg-emerald-400/12 text-emerald-100",
    marker: "#8cf0c8",
  },
};

function cn(...values) {
  return values.filter(Boolean).join(" ");
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function percentage(value, total) {
  if (!total) {
    return 0;
  }
  return (value / total) * 100;
}

function formatTimestamp(value) {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function formatRelativeTime(isoString, now = new Date()) {
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

function getReferenceTimestamp(features) {
  const timestamps = features
    .map((item) => Date.parse(item.properties?.date ?? ""))
    .filter((value) => Number.isFinite(value));

  if (!timestamps.length) {
    return Date.now();
  }

  return Math.max(...timestamps);
}

function matchesSearch(feature, searchTerm) {
  if (!searchTerm.trim()) {
    return true;
  }

  const needle = searchTerm.trim().toLowerCase();
  const haystack = [
    feature.properties.title,
    feature.properties.country,
    feature.properties.locationName,
    ...(feature.properties.tags || []),
    ...(feature.properties.themes || []),
    ...((feature.properties.topArticles || []).map((article) => article.title)),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return haystack.includes(needle);
}

function matchesCategories(feature, activeCategories) {
  if (!activeCategories.length) {
    return true;
  }

  const haystack = [
    feature.properties.title,
    ...(feature.properties.tags || []),
    ...(feature.properties.themes || []),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return activeCategories.some((categoryId) => {
    const category = CATEGORY_DEFINITIONS.find((item) => item.id === categoryId);
    return category ? category.keywords.some((keyword) => haystack.includes(keyword.toLowerCase())) : false;
  });
}

function buildStats(features) {
  const countryCounter = new Map();
  const themeCounter = new Map();
  const severityBuckets = { low: 0, medium: 0, high: 0 };

  features.forEach((feature) => {
    const country = feature.properties.country?.trim() || "Unknown";
    const weight = feature.properties.dataKind === "hotspot" ? feature.properties.hotspotCount ?? 1 : 1;
    countryCounter.set(country, (countryCounter.get(country) ?? 0) + weight);

    const themes = feature.properties.themes?.length ? feature.properties.themes : feature.properties.tags || [];
    themes.forEach((theme) => {
      themeCounter.set(theme, (themeCounter.get(theme) ?? 0) + 1);
    });

    const severityKey = String(feature.properties.severityLabel || "Low").toLowerCase();
    if (severityBuckets[severityKey] !== undefined) {
      severityBuckets[severityKey] += 1;
    }
  });

  return {
    topCountries: [...countryCounter.entries()]
      .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
      .slice(0, 5)
      .map(([name, count]) => ({ name, count })),
    topThemes: [...themeCounter.entries()]
      .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
      .slice(0, 5)
      .map(([name, count]) => ({ name, count })),
    severityBuckets,
  };
}

function getSeverityKey(feature) {
  return String(feature.properties.severityLabel || "Low").toLowerCase();
}

function getMarkerVisual(feature, isSelected) {
  const isCountryLevel = feature.properties.locationPrecision === "country";
  const isHotspot = feature.properties.dataKind === "hotspot";
  const hotspotCount = Math.max(1, feature.properties.hotspotCount ?? 1);
  const baseRadius = isHotspot ? (hotspotCount >= 50 ? 8.6 : hotspotCount >= 20 ? 7.3 : hotspotCount >= 5 ? 5.9 : 4.8) : 3.2;
  const radius = clamp(baseRadius + (isCountryLevel ? 1.35 : 0) + (isSelected ? 1.2 : 0), 3, 11.5);
  const color = severityMeta[getSeverityKey(feature)]?.marker ?? severityMeta.low.marker;

  return {
    color,
    radius,
    haloRadius: radius + (isHotspot ? 4.8 : 3.6),
    haloOpacity: isCountryLevel ? 0.12 : isHotspot ? 0.24 : 0.18,
    densityRadius: radius * (isHotspot ? (isCountryLevel ? 4 : 3.6) : isCountryLevel ? 3.1 : 2.6),
    densityOpacity: isCountryLevel ? 0.11 : isHotspot ? 0.2 : 0.16,
    ringRadius: radius + 5.5,
    pulseRadius: radius + 9,
    strokeWidth: isSelected ? 1.9 : isCountryLevel ? 1 : 1.3,
    precisionVariant: isCountryLevel ? "country" : "exact",
  };
}

function buildMapPayload(worldTopo, visibleFeatures, selectedId) {
  if (!worldTopo) {
    return null;
  }

  const countriesCollection = topoFeature(worldTopo, worldTopo.objects.countries);
  const landCollection = topoFeature(worldTopo, worldTopo.objects.land);
  const graticule = geoGraticule10();
  const projection = geoNaturalEarth1().fitSize([VIEWBOX_WIDTH, VIEWBOX_HEIGHT], countriesCollection);
  const drawPath = geoPath(projection);

  return {
    landPath: drawPath(landCollection) ?? "",
    graticulePath: drawPath(graticule) ?? "",
    countryPaths: countriesCollection.features.map((item, index) => ({
      id: `${item.id ?? index}`,
      path: drawPath(item) ?? "",
      tone: index % 5,
    })),
    markers: visibleFeatures
      .map((feature) => {
        const point = projection(feature.geometry?.coordinates);
        if (!point) {
          return null;
        }

        const isSelected = String(feature.id) === String(selectedId);
        return {
          id: String(feature.id),
          feature,
          x: point[0],
          y: point[1],
          isSelected,
          ...getMarkerVisual(feature, isSelected),
        };
      })
      .filter(Boolean)
      .sort((left, right) => {
        if (left.isSelected && !right.isSelected) {
          return 1;
        }
        if (!left.isSelected && right.isSelected) {
          return -1;
        }
        return left.radius - right.radius;
      }),
  };
}

function ConflictBadge({ tone = "default", children }) {
  return <span className={cn("inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold uppercase tracking-[0.18em]", tone === "default" && "border-white/10 bg-white/6 text-white/65", tone === "sample" && "border-cyan-300/30 bg-cyan-300/12 text-cyan-100", tone === "high" && severityMeta.high.badge, tone === "medium" && severityMeta.medium.badge, tone === "low" && severityMeta.low.badge)}>{children}</span>;
}

function ConflictButton({ children, variant = "secondary", className = "", ...props }) {
  return <button type="button" className={cn("inline-flex h-9 items-center justify-center rounded-xl border px-3.5 text-sm font-semibold transition-all duration-200 disabled:cursor-not-allowed disabled:opacity-50", variant === "primary" && "border-violet-400/30 bg-violet-500/[0.16] text-white hover:-translate-y-0.5 hover:bg-violet-500/[0.22]", variant === "secondary" && "border-white/10 bg-white/6 text-white/90 hover:-translate-y-0.5 hover:border-white/16 hover:bg-white/10", variant === "ghost" && "border-transparent bg-transparent text-white/60 hover:bg-white/6 hover:text-white", className)} {...props}>{children}</button>;
}

function ConflictChip({ active = false, children, onClick }) {
  return <button type="button" className={cn("rounded-full border px-3 py-1.5 text-sm transition-all duration-200", active ? "border-violet-400/30 bg-violet-500/[0.14] text-white shadow-[0_0_22px_rgba(140,103,255,0.16)]" : "border-white/10 bg-white/5 text-white/58 hover:border-white/16 hover:bg-white/8 hover:text-white")} onClick={onClick}>{children}</button>;
}

function ConflictSegmented({ options, value, onChange }) {
  return (
    <div className="flex rounded-2xl border border-white/10 bg-[rgba(12,17,30,0.72)] p-1 shadow-[0_18px_42px_rgba(3,7,20,0.4)] backdrop-blur-[24px]">
      {options.map((option) => {
        const active = option.value === value;
        return <button key={option.value} type="button" className={cn("flex-1 rounded-xl px-3 py-2 text-sm font-semibold transition-all duration-200", active ? "bg-white/12 text-white shadow-[0_8px_24px_rgba(0,0,0,0.28)]" : "text-white/58 hover:text-white")} onClick={() => onChange(option.value)}>{option.label}</button>;
      })}
    </div>
  );
}

function ConflictSearchField({ value, onChange }) {
  return (
    <div className="flex h-11 w-full items-center gap-3 rounded-2xl border border-white/10 bg-white/6 px-4 text-sm text-white">
      <Search className="h-4 w-4 text-white/35" />
      <input value={value} onChange={(event) => onChange(event.target.value)} placeholder="Search title, country, tag, theme..." className="w-full bg-transparent text-sm text-white outline-none placeholder:text-white/40" aria-label="Search loaded events" />
    </div>
  );
}

function ConflictStatPill({ label, value }) {
  return (
    <div className="rounded-[18px] border border-white/10 bg-white/[0.04] px-4 py-3">
      <div className="text-[10px] uppercase tracking-[0.18em] text-white/34">{label}</div>
      <div className="mt-1 text-lg font-semibold text-white">{value}</div>
    </div>
  );
}

function useConflictAssets(refreshToken) {
  const [worldTopo, setWorldTopo] = useState(null);
  const [collection, setCollection] = useState(null);
  const [generatedAt, setGeneratedAt] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;

    async function loadData() {
      setLoading(true);
      setError("");

      try {
        const [topologyResponse, sampleResponse] = await Promise.all([
          fetch("/conflict-map/world.topo.json", { cache: "no-store" }),
          fetch("/conflict-map/conflicts.sample.geojson", { cache: "no-store" }),
        ]);

        if (!topologyResponse.ok || !sampleResponse.ok) {
          throw new Error("Unable to load conflict map assets.");
        }

        const [topologyPayload, samplePayload] = await Promise.all([topologyResponse.json(), sampleResponse.json()]);

        if (!alive) {
          return;
        }

        const featureDates = (samplePayload.features || [])
          .map((item) => item.properties?.date)
          .filter(Boolean)
          .map((value) => Date.parse(value))
          .filter((value) => Number.isFinite(value));

        setWorldTopo(topologyPayload);
        setCollection(samplePayload);
        setGeneratedAt(featureDates.length ? new Date(Math.max(...featureDates)).toISOString() : new Date().toISOString());
      } catch (loadError) {
        if (alive) {
          setError(loadError instanceof Error ? loadError.message : "Unable to load conflict map.");
        }
      } finally {
        if (alive) {
          setLoading(false);
        }
      }
    }

    loadData();

    return () => {
      alive = false;
    };
  }, [refreshToken]);

  return { worldTopo, collection, generatedAt, error, loading };
}

export function ConflictMapSurface({ compact = false }) {
  const [windowValue, setWindowValue] = useState("24h");
  const [severity, setSeverity] = useState("all");
  const [query, setQuery] = useState("");
  const [activeCategories, setActiveCategories] = useState([]);
  const [densityEnabled, setDensityEnabled] = useState(true);
  const [selectedId, setSelectedId] = useState(null);
  const [refreshToken, setRefreshToken] = useState(0);
  const [copied, setCopied] = useState(false);
  const { worldTopo, collection, generatedAt, error, loading } = useConflictAssets(refreshToken);

  const allFeatures = collection?.features ?? [];
  const referenceTimestamp = getReferenceTimestamp(allFeatures);

  const visibleFeatures = useMemo(() => {
    const start = referenceTimestamp - WINDOW_MS[windowValue];
    return allFeatures.filter((feature) => {
      const severityKey = getSeverityKey(feature);
      const featureTime = Date.parse(feature.properties?.date ?? "");

      if (severity !== "all" && severityKey !== severity) {
        return false;
      }

      if (Number.isFinite(featureTime) && featureTime < start) {
        return false;
      }

      if (!matchesCategories(feature, activeCategories)) {
        return false;
      }

      return matchesSearch(feature, query);
    });
  }, [activeCategories, allFeatures, query, referenceTimestamp, severity, windowValue]);

  useEffect(() => {
    if (!visibleFeatures.length) {
      setSelectedId(null);
      return;
    }

    if (!selectedId || !visibleFeatures.some((feature) => String(feature.id) === String(selectedId))) {
      setSelectedId(String(visibleFeatures[0].id));
    }
  }, [selectedId, visibleFeatures]);

  const selectedFeature =
    visibleFeatures.find((feature) => String(feature.id) === String(selectedId)) ??
    allFeatures.find((feature) => String(feature.id) === String(selectedId)) ??
    null;
  const stats = useMemo(() => buildStats(visibleFeatures.length ? visibleFeatures : allFeatures), [allFeatures, visibleFeatures]);
  const mapPayload = useMemo(() => buildMapPayload(worldTopo, visibleFeatures, selectedId), [selectedId, visibleFeatures, worldTopo]);
  const totalSeverityCount = stats.severityBuckets.low + stats.severityBuckets.medium + stats.severityBuckets.high;

  function toggleCategory(categoryId) {
    setActiveCategories((current) =>
      current.includes(categoryId) ? current.filter((value) => value !== categoryId) : [...current, categoryId],
    );
  }

  async function copySummary() {
    if (!selectedFeature) {
      return;
    }

    const isHotspot = selectedFeature.properties.dataKind === "hotspot";
    const summary = isHotspot
      ? [
          `${selectedFeature.properties.locationName || selectedFeature.properties.title}, ${selectedFeature.properties.country || "Unknown country"}`,
          `Hotspot mentions: ${selectedFeature.properties.hotspotCount ?? 1}`,
          `Severity: ${selectedFeature.properties.severityLabel} (${selectedFeature.properties.severityScore}/100)`,
          `Window: ${windowValue}`,
          selectedFeature.properties.locationPrecision === "country" ? "Precision: Approximate location (country-level)" : "Precision: Exact point",
        ].join(" - ")
      : [
          selectedFeature.properties.title,
          `Severity: ${selectedFeature.properties.severityLabel} (${selectedFeature.properties.severityScore}/100)`,
          selectedFeature.properties.locationName || selectedFeature.properties.country || "Location unavailable",
          `Observed: ${selectedFeature.properties.date}`,
          ...(selectedFeature.properties.sourceUrl ? [selectedFeature.properties.sourceUrl] : []),
        ].join("\n");

    await navigator.clipboard.writeText(summary);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }

  if (compact) {
    return (
      <div className="flex h-full min-h-0 flex-col gap-4 overflow-hidden">
        <div className="grid gap-3 sm:grid-cols-3">
          <ConflictStatPill label="Signals" value={loading ? "..." : visibleFeatures.length || allFeatures.length} />
          <ConflictStatPill label="Countries" value={loading ? "..." : stats.topCountries.length} />
          <ConflictStatPill label="High risk" value={loading ? "..." : stats.severityBuckets.high} />
        </div>

        <div className="flex flex-wrap gap-2">
          {SEVERITY_OPTIONS.map((option) => (
            <ConflictChip key={option.value} active={severity === option.value} onClick={() => setSeverity(option.value)}>
              {option.label}
            </ConflictChip>
          ))}
        </div>

        <div className="min-h-0 overflow-hidden rounded-[28px] border border-white/10 bg-[linear-gradient(180deg,rgba(6,9,16,0.98),rgba(5,7,13,0.96))]">
          {mapPayload ? (
            <svg viewBox={`0 0 ${VIEWBOX_WIDTH} ${VIEWBOX_HEIGHT}`} className="h-full w-full">
              <rect width={VIEWBOX_WIDTH} height={VIEWBOX_HEIGHT} fill="rgba(7,10,18,0.98)" />
              <path d={mapPayload.graticulePath} fill="none" stroke="rgba(180,190,214,0.08)" strokeWidth="0.7" strokeDasharray="2 10" />
              <path d={mapPayload.landPath} fill="rgba(14,18,31,0.96)" />
              {mapPayload.countryPaths.map((item) => (
                <path
                  key={item.id}
                  d={item.path}
                  fill={item.tone === 0 ? "rgba(19,25,39,0.98)" : item.tone === 2 ? "rgba(16,21,34,0.98)" : "rgba(14,18,31,0.96)"}
                  stroke="rgba(205,214,233,0.12)"
                  strokeWidth="0.5"
                />
              ))}
              {densityEnabled
                ? mapPayload.markers.map((marker) => (
                    <circle key={`density-${marker.id}`} cx={marker.x} cy={marker.y} r={marker.densityRadius} fill={marker.color} opacity={marker.densityOpacity} />
                  ))
                : null}
              {mapPayload.markers.map((marker) => (
                <g key={marker.id} onClick={() => setSelectedId(marker.id)} className="cursor-pointer">
                  <circle cx={marker.x} cy={marker.y} r={marker.haloRadius} fill={marker.color} opacity={marker.haloOpacity} />
                  <circle cx={marker.x} cy={marker.y} r={marker.radius} fill={marker.color} opacity={marker.precisionVariant === "country" ? 0.54 : 0.94} />
                  {marker.isSelected ? <circle cx={marker.x} cy={marker.y} r={marker.ringRadius} fill="none" stroke="rgba(247,248,253,0.95)" strokeWidth="1.2" opacity="0.92" /> : null}
                </g>
              ))}
            </svg>
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-white/46">{loading ? "Loading conflict-map module..." : error}</div>
          )}
        </div>

        {selectedFeature ? (
          <div className="rounded-[24px] border border-white/10 bg-white/[0.03] px-4 py-4 text-sm text-white/68">
            <div className="flex flex-wrap items-center gap-2">
              <div className="text-sm font-medium text-white">{selectedFeature.properties.locationName || selectedFeature.properties.title}</div>
              <ConflictBadge tone={getSeverityKey(selectedFeature)}>{selectedFeature.properties.severityLabel}</ConflictBadge>
            </div>
            <div className="mt-2 text-white/44">{selectedFeature.properties.country} / {formatTimestamp(selectedFeature.properties.date)}</div>
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <main className="relative min-h-screen overflow-hidden bg-[rgb(7,10,18)] text-[rgb(236,239,248)]">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(132,96,255,0.14),transparent_28%),radial-gradient(circle_at_85%_12%,rgba(63,209,255,0.08),transparent_20%),radial-gradient(circle_at_bottom_center,rgba(20,28,52,0.75),transparent_40%),rgb(7,10,18)]" />
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] [background-size:64px_64px] [mask-image:radial-gradient(circle_at_center,black_40%,transparent_90%)] opacity-[0.18]" />
      <div className="pointer-events-none absolute inset-0 shadow-[inset_0_0_180px_rgba(0,0,0,0.75)]" />
      <div className="absolute inset-0">
        {mapPayload ? (
          <svg viewBox={`0 0 ${VIEWBOX_WIDTH} ${VIEWBOX_HEIGHT}`} className="h-full w-full">
            <defs>
              <radialGradient id="conflict-map-ocean-glow" cx="50%" cy="40%" r="72%">
                <stop offset="0%" stopColor="rgba(255,255,255,0.07)" />
                <stop offset="100%" stopColor="rgba(0,0,0,0)" />
              </radialGradient>
            </defs>

            <rect width={VIEWBOX_WIDTH} height={VIEWBOX_HEIGHT} fill="rgba(7,10,18,0.98)" />
            <rect width={VIEWBOX_WIDTH} height={VIEWBOX_HEIGHT} fill="url(#conflict-map-ocean-glow)" />
            <path d={mapPayload.graticulePath} fill="none" stroke="rgba(180,190,214,0.08)" strokeWidth="0.7" strokeDasharray="2 10" />
            <path d={mapPayload.landPath} fill="rgba(14,18,31,0.96)" />
            {mapPayload.countryPaths.map((item) => (
              <path
                key={item.id}
                d={item.path}
                fill={item.tone === 0 ? "rgba(19,25,39,0.98)" : item.tone === 2 ? "rgba(16,21,34,0.98)" : "rgba(14,18,31,0.96)"}
                stroke="rgba(205,214,233,0.18)"
                strokeWidth="0.65"
              />
            ))}
            {densityEnabled
              ? mapPayload.markers.map((marker) => (
                  <circle key={`density-${marker.id}`} cx={marker.x} cy={marker.y} r={marker.densityRadius} fill={marker.color} opacity={marker.densityOpacity} pointerEvents="none" />
                ))
              : null}
            {mapPayload.markers.map((marker) => (
              <g key={marker.id} onClick={() => setSelectedId(marker.id)} className="cursor-pointer">
                {marker.isSelected ? <circle cx={marker.x} cy={marker.y} r={marker.ringRadius + 3} fill={marker.color} opacity="0.1" /> : null}
                {marker.precisionVariant === "exact" && marker.feature.properties.dataKind === "hotspot" ? <circle cx={marker.x} cy={marker.y} r={marker.pulseRadius} fill={marker.color} opacity="0.08" /> : null}
                <circle cx={marker.x} cy={marker.y} r={marker.haloRadius} fill={marker.color} opacity={marker.haloOpacity} />
                <circle cx={marker.x} cy={marker.y} r={marker.radius} fill={marker.color} opacity={marker.precisionVariant === "country" ? 0.54 : 0.94} stroke="rgba(246,248,254,0.78)" strokeWidth={marker.strokeWidth} />
                {marker.isSelected ? <circle cx={marker.x} cy={marker.y} r={marker.ringRadius} fill="none" stroke="rgba(247,248,253,0.95)" strokeWidth="1.2" opacity="0.92" /> : null}
              </g>
            ))}
          </svg>
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-white/52">{loading ? "Loading conflict-map module..." : error}</div>
        )}
      </div>
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.04),transparent_40%),linear-gradient(180deg,rgba(6,9,16,0.18),rgba(6,9,16,0.68))]" />
      <aside className="pointer-events-auto absolute left-4 top-24 z-20 flex max-h-[calc(100vh-7rem)] w-[min(24rem,calc(100vw-2rem))] flex-col overflow-hidden rounded-[28px] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.08),rgba(255,255,255,0.04)),rgba(12,17,30,0.72)] shadow-[0_18px_42px_rgba(3,7,20,0.58),inset_0_1px_0_rgba(255,255,255,0.06),0_0_42px_rgba(125,84,255,0.12)] backdrop-blur-[24px]">
        <div className="border-b border-white/8 px-5 py-5">
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-violet-200/85">IntelliTrade Signal Deck</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-white">IntelliConflict</h1>
          <p className="mt-2 max-w-sm text-sm leading-6 text-white/56">Live risk signals from global news flow.</p>
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto px-5 py-5">
          <section className="space-y-3">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/48">Time window</p>
            <ConflictSegmented options={WINDOW_OPTIONS} value={windowValue} onChange={setWindowValue} />
          </section>

          <section className="space-y-3">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/48">Severity</p>
            <div className="flex flex-wrap gap-2">
              {SEVERITY_OPTIONS.map((option) => (
                <ConflictChip key={option.value} active={severity === option.value} onClick={() => setSeverity(option.value)}>
                  {option.label}
                </ConflictChip>
              ))}
            </div>
          </section>

          <section className="space-y-3">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/48">Categories</p>
            <div className="flex flex-wrap gap-2">
              {CATEGORY_DEFINITIONS.map((category) => (
                <ConflictChip key={category.id} active={activeCategories.includes(category.id)} onClick={() => toggleCategory(category.id)}>
                  {category.label}
                </ConflictChip>
              ))}
            </div>
          </section>

          <section className="space-y-3">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/48">Search</p>
            <ConflictSearchField value={query} onChange={setQuery} />
          </section>

          <section className="space-y-4 rounded-[24px] border border-white/8 bg-white/4 p-4">
            <div className="flex items-end justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/48">Total events</p>
                <p className="mt-2 text-3xl font-semibold text-white">{loading ? "..." : visibleFeatures.length.toLocaleString()}</p>
              </div>
              <div className="rounded-2xl border border-white/8 bg-black/20 px-3 py-2 text-right">
                <p className="text-[11px] uppercase tracking-[0.16em] text-white/48">Density</p>
                <p className="mt-1 text-sm font-semibold text-white">
                  {visibleFeatures.length >= 120 ? "Elevated" : visibleFeatures.length >= 40 ? "Active" : "Watching"}
                </p>
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs uppercase tracking-[0.16em] text-white/48">
                <span>Severity distribution</span>
                <span>{totalSeverityCount.toLocaleString()} tracked</span>
              </div>
              <div className="flex h-3 overflow-hidden rounded-full bg-white/6">
                <div className="bg-emerald-400/70" style={{ width: `${percentage(stats.severityBuckets.low, totalSeverityCount)}%` }} />
                <div className="bg-amber-300/80" style={{ width: `${percentage(stats.severityBuckets.medium, totalSeverityCount)}%` }} />
                <div className="bg-rose-400/80" style={{ width: `${percentage(stats.severityBuckets.high, totalSeverityCount)}%` }} />
              </div>
              <div className="grid grid-cols-3 gap-2 text-xs text-white/48">
                <span>Low {stats.severityBuckets.low}</span>
                <span>Medium {stats.severityBuckets.medium}</span>
                <span>High {stats.severityBuckets.high}</span>
              </div>
            </div>

            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-white/48">Top countries</p>
              <div className="space-y-2">
                {(stats.topCountries.length ? stats.topCountries : [{ name: "No data", count: 0 }]).map((country) => (
                  <div key={country.name} className="flex items-center justify-between rounded-2xl border border-white/6 bg-white/4 px-3 py-2">
                    <span className="text-sm text-white">{country.name}</span>
                    <span className="text-xs font-semibold text-white/48">{loading ? "-" : country.count}</span>
                  </div>
                ))}
              </div>
            </div>
          </section>
        </div>
      </aside>

      <div className="pointer-events-auto absolute right-4 top-24 z-20 flex max-w-[calc(100vw-2rem)] items-start gap-3">
        <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.08),rgba(255,255,255,0.04)),rgba(12,17,30,0.72)] px-3 py-3 shadow-[0_18px_42px_rgba(3,7,20,0.58),inset_0_1px_0_rgba(255,255,255,0.06),0_0_42px_rgba(125,84,255,0.12)] backdrop-blur-[24px]">
          <ConflictButton variant="secondary" onClick={() => setRefreshToken((current) => current + 1)} title="Refreshes the local sample dataset.">
            <RotateCw className="mr-2 h-4 w-4" />
            Refresh
          </ConflictButton>
          <ConflictButton variant={densityEnabled ? "primary" : "secondary"} onClick={() => setDensityEnabled((current) => !current)}>
            Density
          </ConflictButton>
          <ConflictBadge tone="sample">Sample data mode</ConflictBadge>
          {error ? <ConflictBadge tone="medium">{error}</ConflictBadge> : null}
          <div className="min-w-[9rem] text-right">
            <p className="text-[11px] uppercase tracking-[0.18em] text-white/48">Last updated</p>
            <p className="mt-1 text-sm font-medium text-white">{generatedAt ? formatTimestamp(generatedAt) : loading ? "Loading..." : "--"}</p>
          </div>
        </div>
      </div>

      <aside
        className={cn(
          "pointer-events-auto absolute bottom-4 right-4 top-24 z-20 w-[min(24rem,calc(100vw-2rem))] rounded-[28px] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.08),rgba(255,255,255,0.04)),rgba(12,17,30,0.72)] shadow-[0_18px_42px_rgba(3,7,20,0.58),inset_0_1px_0_rgba(255,255,255,0.06),0_0_42px_rgba(125,84,255,0.12)] backdrop-blur-[24px] transition-transform duration-200",
          selectedFeature ? "translate-x-0" : "translate-x-[110%]",
        )}
        aria-hidden={!selectedFeature}
      >
        <div className="flex h-full flex-col">
          <div className="flex items-start justify-between border-b border-white/8 px-5 py-5">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/48">
                {selectedFeature?.properties.dataKind === "hotspot" ? "Hotspot" : "Article-derived signal"}
              </p>
              <h2 className="mt-2 text-xl font-semibold text-white">{selectedFeature ? selectedFeature.properties.locationName || selectedFeature.properties.title : "Select a signal"}</h2>
              {selectedFeature?.properties.country ? <p className="mt-2 text-sm text-white/56">{selectedFeature.properties.country}</p> : null}
            </div>
            <ConflictButton variant="ghost" onClick={() => setSelectedId(null)}>
              Close
            </ConflictButton>
          </div>
          <div className="flex-1 space-y-5 overflow-y-auto px-5 py-5">
            {selectedFeature ? (
              <>
                <section className="space-y-3 rounded-[24px] border border-white/8 bg-white/4 p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <ConflictBadge tone={getSeverityKey(selectedFeature)}>{selectedFeature.properties.severityLabel}</ConflictBadge>
                    {selectedFeature.properties.dataKind === "hotspot" ? <span className="rounded-full border border-white/10 bg-white/6 px-3 py-1 text-sm text-white/90">Mentions {selectedFeature.properties.hotspotCount ?? 1}</span> : null}
                    <span className="text-sm text-white/90">Score {selectedFeature.properties.severityScore}</span>
                  </div>
                  <div className="space-y-1 text-sm text-white/56">
                    {selectedFeature.properties.dataKind !== "hotspot" ? <p>{formatRelativeTime(selectedFeature.properties.date)}</p> : null}
                    <p>{formatTimestamp(selectedFeature.properties.date)}</p>
                    <p className="font-medium text-white/90">
                      {selectedFeature.properties.locationName || "Location unavailable"}
                      {selectedFeature.properties.country ? `, ${selectedFeature.properties.country}` : ""}
                    </p>
                    {selectedFeature.properties.locationPrecision === "country" ? <p className="text-xs font-semibold uppercase tracking-[0.16em] text-amber-100/80">Approximate location (country-level)</p> : null}
                  </div>
                </section>

                {selectedFeature.properties.dataKind === "hotspot" && selectedFeature.properties.topArticles?.length ? (
                  <section className="space-y-3 rounded-[24px] border border-white/8 bg-white/4 p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/48">Top articles</p>
                    <p className="text-sm text-white/56">Showing a few representative articles.</p>
                    <div className="space-y-2">
                      {selectedFeature.properties.topArticles.map((article) => (
                        <a
                          key={article.url}
                          href={article.url}
                          target="_blank"
                          rel="noreferrer"
                          className="block rounded-2xl border border-white/8 bg-white/4 px-3 py-3 text-sm text-white transition-colors duration-200 hover:border-white/14 hover:bg-white/8"
                        >
                          {article.title}
                        </a>
                      ))}
                    </div>
                  </section>
                ) : null}

                <section className="space-y-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/48">Tags</p>
                  <div className="flex flex-wrap gap-2">
                    {selectedFeature.properties.tags?.length ? selectedFeature.properties.tags.map((tag) => <ConflictChip key={tag}>{tag}</ConflictChip>) : <p className="text-sm text-white/56">No derived tags.</p>}
                  </div>
                </section>

                <section className="space-y-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/48">Themes</p>
                  <div className="flex flex-wrap gap-2">
                    {selectedFeature.properties.themes?.length ? selectedFeature.properties.themes.map((theme) => <ConflictChip key={theme}>{theme}</ConflictChip>) : <p className="text-sm text-white/56">No theme enrichment available.</p>}
                  </div>
                </section>
              </>
            ) : (
              <div className="flex h-full items-center justify-center text-center text-sm text-white/56">Pick a cluster or event marker to inspect the signal.</div>
            )}
          </div>

          <div className={cn("border-t border-white/8 px-5 py-5", selectedFeature?.properties.dataKind === "hotspot" ? "" : "grid grid-cols-2 gap-3")}>
            {selectedFeature?.properties.dataKind !== "hotspot" ? (
              <ConflictButton
                variant="primary"
                disabled={!selectedFeature?.properties.sourceUrl}
                onClick={() => {
                  if (selectedFeature?.properties.sourceUrl) {
                    window.open(selectedFeature.properties.sourceUrl, "_blank", "noopener,noreferrer");
                  }
                }}
              >
                Open source
              </ConflictButton>
            ) : null}
            <ConflictButton variant={selectedFeature?.properties.dataKind === "hotspot" ? "primary" : "secondary"} className={selectedFeature?.properties.dataKind === "hotspot" ? "w-full" : ""} disabled={!selectedFeature} onClick={copySummary}>
              {copied ? "Copied" : "Copy summary"}
            </ConflictButton>
          </div>
        </div>
      </aside>

      <div className="pointer-events-auto absolute bottom-4 left-4 z-20 flex max-w-[min(28rem,calc(100vw-2rem))] flex-wrap items-center gap-3">
        <div className="rounded-full border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.08),rgba(255,255,255,0.04)),rgba(12,17,30,0.72)] px-3 py-2 text-xs uppercase tracking-[0.18em] text-white/50 shadow-[0_18px_42px_rgba(3,7,20,0.58),inset_0_1px_0_rgba(255,255,255,0.06)] backdrop-blur-[24px]">
          Data: GDELT sample
        </div>
        <div className="rounded-full border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.08),rgba(255,255,255,0.04)),rgba(12,17,30,0.72)] px-3 py-2 text-xs uppercase tracking-[0.18em] text-white/50 shadow-[0_18px_42px_rgba(3,7,20,0.58),inset_0_1px_0_rgba(255,255,255,0.06)] backdrop-blur-[24px]">
          Bundled basemap: Natural Earth
        </div>
      </div>
    </main>
  );
}

export default function ConflictMapPage() {
  return <ConflictMapSurface />;
}