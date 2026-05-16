"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { geoEqualEarth, geoGraticule10, geoPath } from "d3-geo";
import { select } from "d3-selection";
import { zoom as d3Zoom, zoomIdentity } from "d3-zoom";
import { feature as topoFeature, mesh as topoMesh } from "topojson-client";
import { RotateCw, Search } from "lucide-react";
import { CATEGORY_DEFINITIONS } from "@/lib/conflicts/scoring";

// ─── Constants ────────────────────────────────────────────────────────────────

const DEFAULT_VIEWPORT = { width: 1440, height: 900 };

const WINDOW_OPTIONS = [
  { label: "24H", value: "24h" },
  { label: "7D", value: "7d" },
  { label: "30D", value: "30d" },
];

const SEVERITY_OPTIONS = [
  { label: "All", value: "all" },
  { label: "High", value: "high" },
  { label: "Medium", value: "medium" },
  { label: "Low", value: "low" },
];

const severityMeta = {
  high: { badge: "border-rose-400/30 bg-rose-400/12 text-rose-100", marker: "#ff8dac" },
  medium: { badge: "border-amber-300/30 bg-amber-300/12 text-amber-100", marker: "#ffd676" },
  low: { badge: "border-emerald-400/30 bg-emerald-400/12 text-emerald-100", marker: "#8cf0c8" },
};

const ZOOM_STEP = 1.4;
const CLUSTER_GRID_SIZE = 26;
const CLUSTER_SCALE_THRESHOLD = 2.2;

const STRATEGIC_LABELS = [
  { coordinates: [-101, 45], label: "N. America" },
  { coordinates: [-58, -14], label: "S. America" },
  { coordinates: [17, 53], label: "Europe" },
  { coordinates: [24, 6], label: "Africa" },
  { coordinates: [45, 30], label: "Middle East" },
  { coordinates: [78, 23], label: "India" },
  { coordinates: [104, 35], label: "China" },
  { coordinates: [134, -25], label: "Australia" },
];

// ─── Utilities ────────────────────────────────────────────────────────────────

function cn(...values) {
  return values.filter(Boolean).join(" ");
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function percentage(value, total) {
  if (!total) return 0;
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
  if (Math.abs(diffMinutes) < 60) return formatter.format(diffMinutes, "minute");
  const diffHours = Math.round(diffMinutes / 60);
  if (Math.abs(diffHours) < 24) return formatter.format(diffHours, "hour");
  const diffDays = Math.round(diffHours / 24);
  if (Math.abs(diffDays) < 30) return formatter.format(diffDays, "day");
  return formatter.format(Math.round(diffDays / 30), "month");
}

function getSeverityKey(feature) {
  return String(feature.properties.severityLabel || "Low").toLowerCase();
}

function getDisplayTitle(feature) {
  return feature?.properties.displayTitle || feature?.properties.title || "";
}

const CONFLICT_NOISE_RE =
  /\b(FIFA|UEFA|NBA|NFL|cricket match|rugby match|tennis (final|open|cup)|golf (tour|open)|world cup final|championship (game|match|final)|box office|film festival|Grammy|Oscar (ceremony|winner)|netflix (series|show)|Disney\+?|music video|album (release|drop)|concert tour|sports news|football (match|game|score)|soccer (game|score)|basketball (game|score)|baseball (game|score)|hockey (game|score)|volleyball|swimming (race|meet)|athletics (race|meet)|marathon (race|result)|Super Bowl|Champions League final)\b/i;

function isConflictNoise(feature) {
  const haystack = [
    feature.properties.title,
    feature.properties.displayTitle,
    ...(feature.properties.tags || []),
    ...(feature.properties.themes || []),
  ]
    .filter(Boolean)
    .join(" ");
  return CONFLICT_NOISE_RE.test(haystack);
}

function matchesSearch(feature, searchTerm) {
  if (!searchTerm.trim()) return true;
  const needle = searchTerm.trim().toLowerCase();
  const haystack = [
    feature.properties.title,
    feature.properties.displayTitle,
    feature.properties.country,
    feature.properties.locationName,
    ...(feature.properties.tags || []),
    ...(feature.properties.themes || []),
    ...((feature.properties.topArticles || []).map((a) => a.title)),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return haystack.includes(needle);
}

function matchesCategories(feature, activeCategories) {
  if (!activeCategories.length) return true;
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
    return category
      ? category.keywords.some((keyword) => haystack.includes(keyword.toLowerCase()))
      : false;
  });
}

function buildClientStats(features) {
  const countryCounter = new Map();
  const themeCounter = new Map();
  const severityBuckets = { low: 0, medium: 0, high: 0 };
  features.forEach((feature) => {
    const country = feature.properties.country?.trim() || "Unknown";
    const weight =
      feature.properties.dataKind === "hotspot"
        ? (feature.properties.hotspotCount ?? 1)
        : 1;
    countryCounter.set(country, (countryCounter.get(country) ?? 0) + weight);
    const themes = feature.properties.themes?.length
      ? feature.properties.themes
      : feature.properties.tags || [];
    themes.forEach((theme) => themeCounter.set(theme, (themeCounter.get(theme) ?? 0) + 1));
    const sk = String(feature.properties.severityLabel || "Low").toLowerCase();
    if (sk in severityBuckets) severityBuckets[sk] += 1;
  });
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

// ─── Marker logic (ported from standalone hotspots.ts) ────────────────────────

function severityColor(score) {
  if (score >= 67) return "#ff8dac";
  if (score >= 34) return "#ffd676";
  return "#8cf0c8";
}

function getHotspotRadius(hotspotCount) {
  if (hotspotCount >= 50) return 8.6;
  if (hotspotCount >= 20) return 7.3;
  if (hotspotCount >= 5) return 5.9;
  return 4.8;
}

function getMarkerVisual(feature, isSelected) {
  const isCountryLevel = feature.properties.locationPrecision === "country";
  const isHotspot = feature.properties.dataKind === "hotspot";
  const hotspotCount = Math.max(1, feature.properties.hotspotCount ?? 1);
  const baseRadius = isHotspot ? getHotspotRadius(hotspotCount) : 3.2;
  const radius = clamp(
    baseRadius + (isCountryLevel ? 1.35 : 0) + (isSelected ? 1.2 : 0),
    3,
    11.5
  );
  return {
    color: severityColor(feature.properties.severityScore),
    coreOpacity: isCountryLevel ? 0.54 : 0.94,
    densityOpacity: isCountryLevel ? 0.11 : isHotspot ? 0.2 : 0.16,
    densityRadius:
      radius * (isHotspot ? (isCountryLevel ? 4 : 3.6) : isCountryLevel ? 3.1 : 2.6),
    haloOpacity: isCountryLevel ? 0.12 : isHotspot ? 0.24 : 0.18,
    haloRadius: radius + (isHotspot ? 4.8 : 3.6),
    interactiveRadius: radius + 10,
    precisionVariant: isCountryLevel ? "country" : "exact",
    pulseRadius: radius + 9,
    radius,
    ringRadius: radius + 5.5,
    strokeWidth: isSelected ? 1.9 : isCountryLevel ? 1 : 1.3,
  };
}

function projectConflictMarkers(features, projection, selectedId) {
  return features
    .flatMap((feature) => {
      const point = projection(feature.geometry?.coordinates);
      if (!point) return [];
      const isSelected = String(feature.id) === String(selectedId);
      return [
        {
          ...getMarkerVisual(feature, isSelected),
          feature,
          id: String(feature.id),
          isSelected,
          x: point[0],
          y: point[1],
        },
      ];
    })
    .sort((a, b) => {
      if (a.isSelected && !b.isSelected) return 1;
      if (!a.isSelected && b.isSelected) return -1;
      return a.feature.properties.severityScore - b.feature.properties.severityScore;
    });
}

function clusterSvgMarkers(markers, gridSize) {
  const cells = new Map();
  for (const marker of markers) {
    const key = `${Math.floor(marker.x / gridSize)}_${Math.floor(marker.y / gridSize)}`;
    const existing = cells.get(key);
    if (existing) existing.push(marker);
    else cells.set(key, [marker]);
  }
  const soloMarkers = [];
  const clusters = [];
  for (const [, group] of cells) {
    if (group.length === 1) {
      soloMarkers.push(group[0]);
      continue;
    }
    const cx = group.reduce((s, m) => s + m.x, 0) / group.length;
    const cy = group.reduce((s, m) => s + m.y, 0) / group.length;
    const maxScore = Math.max(...group.map((m) => m.feature.properties.severityScore));
    clusters.push({
      id: `cluster-${Math.round(cx)}-${Math.round(cy)}`,
      x: cx,
      y: cy,
      count: group.length,
      color: severityColor(maxScore),
      events: group.map((m) => m.feature), // retain all contained features
    });
  }
  return { soloMarkers, clusters };
}

// ─── Density profile (ported from standalone density.ts) ─────────────────────

function getDensityProfile(visibleCount) {
  if (visibleCount > 200) return { filterId: null, opacityScale: 0.58, radiusScale: 0.72 };
  if (visibleCount > 75)
    return { filterId: "url(#cm-density-glow-lite)", opacityScale: 0.78, radiusScale: 0.88 };
  return { filterId: "url(#cm-density-glow)", opacityScale: 1, radiusScale: 1 };
}

// ─── Projection helpers ───────────────────────────────────────────────────────

function createWorldProjection(width, height) {
  return geoEqualEarth().fitExtent(
    [
      [32, 32],
      [Math.max(64, width - 32), Math.max(64, height - 32)],
    ],
    { type: "Sphere" }
  );
}

function createViewportExtent(width, height) {
  return [
    [-width * 0.45, -height * 0.45],
    [width * 1.45, height * 1.45],
  ];
}

// ─── Data hooks ───────────────────────────────────────────────────────────────

// Topology is stable — fetch once on mount, never re-fetch on window change.
function useWorldTopo() {
  const [worldTopo, setWorldTopo] = useState(null);
  const [topoError, setTopoError] = useState("");

  useEffect(() => {
    let alive = true;
    fetch("/conflict-map/world.topo.json")
      .then((r) => {
        if (!r.ok) throw new Error("Unable to load basemap.");
        return r.json();
      })
      .then((data) => { if (alive) setWorldTopo(data); })
      .catch((err) => { if (alive) setTopoError(err.message ?? "Basemap unavailable."); });
    return () => { alive = false; };
  }, []); // empty deps — runs exactly once

  return { worldTopo, topoError };
}

// Conflict data re-fetches per window change or manual refresh.
function useConflictData(windowValue, refreshToken) {
  const [collection, setCollection] = useState(null);
  const [apiStats, setApiStats] = useState(null);
  const [generatedAt, setGeneratedAt] = useState(null);
  const [dataState, setDataState] = useState("loading");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError("");
    setDataState("loading");

    const controller = new AbortController();

    async function loadData() {
      try {
        const res = await fetch(
          `/api/conflicts?window=${encodeURIComponent(windowValue)}`,
          { signal: controller.signal },
        );
        if (!res.ok) throw new Error("Unable to load conflict data.");
        const parsed = await res.json();
        if (!alive) return;
        setCollection(parsed.geojson ?? { type: "FeatureCollection", features: [] });
        setApiStats(parsed.stats ?? null);
        setGeneratedAt(parsed.meta?.generatedAt ?? new Date().toISOString());
        const src = parsed.meta?.source;
        setDataState(
          src === "offline"
            ? "offline"
            : src === "stale"
              ? "stale"
              : src === "sample"
                ? "sample"
                : "live",
        );
      } catch (err) {
        if (!alive || (err instanceof Error && err.name === "AbortError")) return;
        setError(err instanceof Error ? err.message : "Unable to load conflict data.");
        setDataState("offline");
      } finally {
        if (alive) setLoading(false);
      }
    }

    loadData();
    return () => {
      alive = false;
      controller.abort();
    };
  }, [windowValue, refreshToken]); // only primitive deps — no object recreation risk

  return { collection, apiStats, generatedAt, dataState, error, loading };
}

// ─── UI primitives ────────────────────────────────────────────────────────────

function ConflictBadge({ tone = "default", children }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold uppercase tracking-[0.18em]",
        tone === "default" && "border-white/10 bg-white/6 text-white/65",
        tone === "sample" && "border-cyan-300/30 bg-cyan-300/12 text-cyan-100",
        tone === "high" && severityMeta.high.badge,
        tone === "medium" && severityMeta.medium.badge,
        tone === "low" && severityMeta.low.badge
      )}
    >
      {children}
    </span>
  );
}

function ConflictButton({ children, variant = "secondary", className = "", ...props }) {
  return (
    <button
      type="button"
      className={cn(
        "inline-flex h-9 items-center justify-center rounded-xl border px-3.5 text-sm font-semibold transition-all duration-200 disabled:cursor-not-allowed disabled:opacity-50",
        variant === "primary" &&
          "border-violet-400/30 bg-violet-500/[0.16] text-white hover:-translate-y-0.5 hover:bg-violet-500/[0.22]",
        variant === "secondary" &&
          "border-white/10 bg-white/6 text-white/90 hover:-translate-y-0.5 hover:border-white/16 hover:bg-white/10",
        variant === "ghost" &&
          "border-transparent bg-transparent text-white/60 hover:bg-white/6 hover:text-white",
        className
      )}
      {...props}
    >
      {children}
    </button>
  );
}

function ConflictChip({ active = false, children, onClick }) {
  return (
    <button
      type="button"
      className={cn(
        "rounded-full border px-3 py-1.5 text-sm transition-all duration-200",
        active
          ? "border-violet-400/30 bg-violet-500/[0.14] text-white shadow-[0_0_22px_rgba(140,103,255,0.16)]"
          : "border-white/10 bg-white/5 text-white/58 hover:border-white/16 hover:bg-white/8 hover:text-white"
      )}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function ConflictSegmented({ options, value, onChange }) {
  return (
    <div className="flex rounded-2xl border border-white/10 bg-[rgba(12,17,30,0.72)] p-1 shadow-[0_18px_42px_rgba(3,7,20,0.4)] backdrop-blur-[24px]">
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            className={cn(
              "flex-1 rounded-xl px-3 py-2 text-sm font-semibold transition-all duration-200",
              active
                ? "bg-white/12 text-white shadow-[0_8px_24px_rgba(0,0,0,0.28)]"
                : "text-white/58 hover:text-white"
            )}
            onClick={() => onChange(option.value)}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

function ConflictSearchField({ value, onChange }) {
  return (
    <div className="flex h-11 w-full items-center gap-3 rounded-2xl border border-white/10 bg-white/6 px-4 text-sm text-white">
      <Search className="h-4 w-4 text-white/35" />
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Search title, country, tag, theme..."
        className="w-full bg-transparent text-sm text-white outline-none placeholder:text-white/40"
        aria-label="Search loaded events"
      />
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

// ─── Main component ───────────────────────────────────────────────────────────

export function ConflictMapSurface({ compact = false }) {
  const [windowValue, setWindowValue] = useState("24h");
  const [activeSeverities, setActiveSeverities] = useState(new Set());
  const [query, setQuery] = useState("");
  const [activeCategories, setActiveCategories] = useState([]);
  const [densityEnabled, setDensityEnabled] = useState(true);
  const [selectedId, setSelectedId] = useState(null);
  const [selectedCluster, setSelectedCluster] = useState(null); // {id, events, x, y, count, color}
  const [refreshToken, setRefreshToken] = useState(0);
  const [copied, setCopied] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [viewport, setViewport] = useState(DEFAULT_VIEWPORT);
  const [isZoomedOut, setIsZoomedOut] = useState(true);

  const containerRef = useRef(null);
  const svgRef = useRef(null);
  const [svgMounted, setSvgMounted] = useState(false);
  const svgCallbackRef = useCallback((node) => {
    svgRef.current = node;
    setSvgMounted(node != null);
  }, []);
  const viewportGroupRef = useRef(null);
  const zoomBehaviorRef = useRef(null);
  const transformRef = useRef(zoomIdentity);
  const animFrameRef = useRef(null);

  const { worldTopo } = useWorldTopo();
  const { collection, apiStats, generatedAt, dataState, error, loading } =
    useConflictData(windowValue, refreshToken);

  const allFeatures = collection?.features ?? [];

  // Detect prefers-reduced-motion
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReducedMotion(mq.matches);
    const handler = (e) => setReducedMotion(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  // ResizeObserver — tracks container size for dynamic viewport (full mode only)
  useEffect(() => {
    if (compact) return;
    const node = containerRef.current;
    if (!node) return;
    const update = () => {
      const next = {
        width: node.clientWidth || DEFAULT_VIEWPORT.width,
        height: node.clientHeight || DEFAULT_VIEWPORT.height,
      };
      setViewport((curr) =>
        curr.width === next.width && curr.height === next.height ? curr : next
      );
    };
    update();
    if (typeof ResizeObserver === "undefined") return;
    const obs = new ResizeObserver(update);
    obs.observe(node);
    return () => obs.disconnect();
  }, [compact]);

  // D3 zoom setup (full mode only)
  useEffect(() => {
    if (compact) return;
    const svgNode = svgRef.current;
    const viewportNode = viewportGroupRef.current;
    if (!svgNode || !viewportNode) return;

    const svg = select(svgNode);
    const behavior = d3Zoom()
      .scaleExtent([1, 6])
      .extent([
        [0, 0],
        [viewport.width, viewport.height],
      ])
      .translateExtent(createViewportExtent(viewport.width, viewport.height))
      .filter((event) => event.type !== "dblclick")
      .on("zoom", (event) => {
        const k = event.transform.k;
        const wasZoomedOut = transformRef.current.k <= CLUSTER_SCALE_THRESHOLD;
        const nowZoomedOut = k <= CLUSTER_SCALE_THRESHOLD;
        transformRef.current = event.transform;
        viewportNode.setAttribute(
          "transform",
          `translate(${event.transform.x} ${event.transform.y}) scale(${k})`
        );
        // Only trigger React re-render when crossing the cluster threshold
        if (wasZoomedOut !== nowZoomedOut) setIsZoomedOut(nowZoomedOut);
      });

    zoomBehaviorRef.current = behavior;
    svg.call(behavior);
    svg.call(behavior.transform, transformRef.current);

    return () => {
      svg.on(".zoom", null);
    };
  }, [compact, svgMounted, viewport.width, viewport.height]);

  // Cleanup animation frames on unmount
  useEffect(
    () => () => {
      if (animFrameRef.current !== null) cancelAnimationFrame(animFrameRef.current);
    },
    []
  );

  // Filtered visible features
  const visibleFeatures = useMemo(() => {
    return allFeatures.filter((feature) => {
      if (isConflictNoise(feature)) return false;
      const sk = getSeverityKey(feature);
      if (activeSeverities.size > 0 && !activeSeverities.has(sk)) return false;
      if (!matchesCategories(feature, activeCategories)) return false;
      return matchesSearch(feature, query);
    });
  }, [allFeatures, query, activeSeverities, activeCategories]);

  // Auto-select first visible on filter change
  useEffect(() => {
    if (!visibleFeatures.length) {
      setSelectedId(null);
      return;
    }
    setSelectedId((current) => {
      if (current && visibleFeatures.some((f) => String(f.id) === String(current)))
        return current;
      return String(visibleFeatures[0].id);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleFeatures]);

  const selectedFeature =
    visibleFeatures.find((f) => String(f.id) === String(selectedId)) ??
    allFeatures.find((f) => String(f.id) === String(selectedId)) ??
    null;

  // Prefer server-side stats from API; fall back to client-side computation
  const stats = useMemo(
    () => apiStats ?? buildClientStats(visibleFeatures.length ? visibleFeatures : allFeatures),
    [apiStats, allFeatures, visibleFeatures]
  );

  // Dynamic projection — recreated on viewport change
  const projection = useMemo(
    () => createWorldProjection(viewport.width, viewport.height),
    [viewport.width, viewport.height]
  );

  // Map geometry layers — recomputed only when topology or projection changes
  const mapLayers = useMemo(() => {
    if (!worldTopo) return null;
    const drawPath = geoPath(projection);
    const countriesGeo = topoFeature(worldTopo, worldTopo.objects.countries);
    const landGeo = topoFeature(worldTopo, worldTopo.objects.land);
    const bordersMesh = topoMesh(
      worldTopo,
      worldTopo.objects.countries,
      (a, b) => a !== b
    );
    return {
      landPath: drawPath(landGeo) ?? "",
      borderPath: drawPath(bordersMesh) ?? "",
      graticulePath: drawPath(geoGraticule10()) ?? "",
      countryPaths: countriesGeo.features.map((item, idx) => ({
        id: `${item.id ?? idx}`,
        path: drawPath(item) ?? "",
        tone: idx % 5,
      })),
    };
  }, [worldTopo, projection]);

  // Projected markers — recomputed when features, projection, or selection changes
  const markers = useMemo(
    () => projectConflictMarkers(visibleFeatures, projection, selectedId),
    [visibleFeatures, projection, selectedId]
  );

  // Clustering — only splits at high zoom
  const { soloMarkers, clusters } = useMemo(() => {
    if (!isZoomedOut) return { soloMarkers: markers, clusters: [] };
    return clusterSvgMarkers(markers, CLUSTER_GRID_SIZE);
  }, [isZoomedOut, markers]);

  // Density glow profile — scales down effects when many markers are visible
  const densityProfile = useMemo(() => getDensityProfile(markers.length), [markers.length]);

  // Strategic continent labels
  const strategicLabels = useMemo(() => {
    return STRATEGIC_LABELS.flatMap((label) => {
      const p = projection(label.coordinates);
      if (!p) return [];
      return [{ ...label, x: p[0], y: p[1] }];
    });
  }, [projection]);

  // Marker lookup map for auto-pan
  const markerLookup = useMemo(() => new Map(markers.map((m) => [m.id, m])), [markers]);

  // Auto-pan map to selected marker (full mode)
  useEffect(() => {
    if (!selectedId || compact) return;
    const marker = markerLookup.get(selectedId);
    const svgNode = svgRef.current;
    const behavior = zoomBehaviorRef.current;
    if (!marker || !svgNode || !behavior) return;

    const targetScale =
      marker.precisionVariant === "country"
        ? 1.75
        : marker.feature.properties.dataKind === "hotspot"
          ? 2.3
          : 2;
    const target = zoomIdentity
      .translate(
        viewport.width / 2 - marker.x * targetScale,
        viewport.height / 2 - marker.y * targetScale
      )
      .scale(targetScale);

    animateToTransform(target, 220);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, viewport]);

  // ─── Animation helper ─────────────────────────────────────────────────────

  function animateToTransform(targetTransform, duration) {
    const svgNode = svgRef.current;
    const behavior = zoomBehaviorRef.current;
    if (!svgNode || !behavior) return;
    const svg = select(svgNode);

    if (reducedMotion) {
      svg.call(behavior.transform, targetTransform);
      return;
    }

    if (animFrameRef.current !== null) cancelAnimationFrame(animFrameRef.current);
    const startTransform = transformRef.current;
    let startTime = null;

    const tick = (timestamp) => {
      if (startTime === null) startTime = timestamp;
      const progress = Math.min((timestamp - startTime) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      const interpolated = zoomIdentity
        .translate(
          startTransform.x + (targetTransform.x - startTransform.x) * eased,
          startTransform.y + (targetTransform.y - startTransform.y) * eased
        )
        .scale(startTransform.k + (targetTransform.k - startTransform.k) * eased);
      svg.call(behavior.transform, interpolated);
      if (progress < 1) animFrameRef.current = requestAnimationFrame(tick);
    };

    animFrameRef.current = requestAnimationFrame(tick);
  }

  // ─── Zoom controls ────────────────────────────────────────────────────────

  function handleZoomIn() {
    const t = transformRef.current;
    const targetK = Math.min(t.k * ZOOM_STEP, 6);
    const cx = viewport.width / 2;
    const cy = viewport.height / 2;
    const r = targetK / t.k;
    animateToTransform(
      zoomIdentity.translate(cx - (cx - t.x) * r, cy - (cy - t.y) * r).scale(targetK),
      200
    );
  }

  function handleZoomOut() {
    const t = transformRef.current;
    const targetK = Math.max(t.k / ZOOM_STEP, 1);
    const cx = viewport.width / 2;
    const cy = viewport.height / 2;
    const r = targetK / t.k;
    animateToTransform(
      zoomIdentity.translate(cx - (cx - t.x) * r, cy - (cy - t.y) * r).scale(targetK),
      200
    );
  }

  function handleResetView() {
    animateToTransform(zoomIdentity, 300);
  }

  function handleClusterClick(cluster) {
    // Open the group detail drawer so the user can inspect contained events.
    setSelectedCluster(cluster);
    setSelectedId(null);

    // Zoom toward the cluster centre so individual markers become visible.
    const t = transformRef.current;
    const targetK = Math.min(t.k * 2.2, 6);
    animateToTransform(
      zoomIdentity
        .translate(
          viewport.width / 2 - cluster.x * targetK,
          viewport.height / 2 - cluster.y * targetK
        )
        .scale(targetK),
      250
    );
  }

  function handleClusterEventSelect(feature) {
    setSelectedCluster(null);
    setSelectedId(String(feature.id));
  }

  // ─── Filter toggles ───────────────────────────────────────────────────────

  function toggleSeverity(value) {
    if (value === "all") {
      setActiveSeverities(new Set());
      return;
    }
    setActiveSeverities((curr) => {
      const next = new Set(curr);
      if (next.has(value)) next.delete(value);
      else next.add(value);
      return next;
    });
  }

  function toggleCategory(categoryId) {
    setActiveCategories((curr) =>
      curr.includes(categoryId) ? curr.filter((v) => v !== categoryId) : [...curr, categoryId]
    );
  }

  async function copySummary() {
    if (!selectedFeature) return;
    const title = getDisplayTitle(selectedFeature);
    const isHotspot = selectedFeature.properties.dataKind === "hotspot";
    const summary = isHotspot
      ? [
          `${selectedFeature.properties.locationName || title}, ${selectedFeature.properties.country || "Unknown country"}`,
          `Hotspot mentions: ${selectedFeature.properties.hotspotCount ?? 1}`,
          `Severity: ${selectedFeature.properties.severityLabel} (${selectedFeature.properties.severityScore}/100)`,
          `Window: ${windowValue}`,
          selectedFeature.properties.locationPrecision === "country"
            ? "Precision: Approximate location (country-level)"
            : "Precision: Exact point",
        ].join(" — ")
      : [
          title,
          `Severity: ${selectedFeature.properties.severityLabel} (${selectedFeature.properties.severityScore}/100)`,
          selectedFeature.properties.locationName ||
            selectedFeature.properties.country ||
            "Location unavailable",
          `Observed: ${selectedFeature.properties.date}`,
          ...(selectedFeature.properties.sourceUrl ? [selectedFeature.properties.sourceUrl] : []),
        ].join("\n");
    await navigator.clipboard.writeText(summary);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }

  const totalSeverityCount =
    stats.severityBuckets.low + stats.severityBuckets.medium + stats.severityBuckets.high;
  const isOffline = dataState === "offline";
  const isStale = dataState === "stale";
  const isSample = dataState === "sample";

  // ─── Compact render (dashboard widget) ───────────────────────────────────
  // In compact mode: ResizeObserver is skipped so viewport stays DEFAULT_VIEWPORT,
  // meaning mapLayers and markers are already computed for the right viewport.

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
            <ConflictChip
              key={option.value}
              active={
                option.value === "all"
                  ? activeSeverities.size === 0
                  : activeSeverities.has(option.value)
              }
              onClick={() => toggleSeverity(option.value)}
            >
              {option.label}
            </ConflictChip>
          ))}
        </div>

        <div className="relative min-h-0 flex-1">
          <div className="absolute inset-0 overflow-hidden rounded-[28px] border border-white/10 bg-[linear-gradient(180deg,rgba(6,9,16,0.98),rgba(5,7,13,0.96))]">
            {mapLayers ? (
              <svg
                viewBox={`0 0 ${DEFAULT_VIEWPORT.width} ${DEFAULT_VIEWPORT.height}`}
                className="h-full w-full"
              >
                <defs>
                  <filter id="cm-compact-glow" x="-50%" y="-50%" width="200%" height="200%">
                    <feGaussianBlur stdDeviation="10" />
                  </filter>
                </defs>
                <rect
                  width={DEFAULT_VIEWPORT.width}
                  height={DEFAULT_VIEWPORT.height}
                  fill="rgba(7,10,18,0.98)"
                />
                <path
                  d={mapLayers.graticulePath}
                  fill="none"
                  stroke="rgba(180,190,214,0.08)"
                  strokeWidth="0.7"
                  strokeDasharray="2 10"
                />
                <path d={mapLayers.landPath} fill="rgba(14,18,31,0.96)" />
                {mapLayers.countryPaths.map((item) => (
                  <path
                    key={item.id}
                    d={item.path}
                    fill={
                      item.tone === 0
                        ? "rgba(19,25,39,0.98)"
                        : item.tone === 2
                          ? "rgba(16,21,34,0.98)"
                          : "rgba(14,18,31,0.96)"
                    }
                    stroke="rgba(0,0,0,0)"
                  />
                ))}
                <path
                  d={mapLayers.borderPath}
                  fill="none"
                  stroke="rgba(205,214,233,0.12)"
                  strokeWidth="0.5"
                />
                {densityEnabled
                  ? markers.map((marker) => (
                      <circle
                        key={`density-${marker.id}`}
                        cx={marker.x}
                        cy={marker.y}
                        r={marker.densityRadius * 0.9}
                        fill={marker.color}
                        opacity={marker.densityOpacity * 0.8}
                        filter="url(#cm-compact-glow)"
                        pointerEvents="none"
                      />
                    ))
                  : null}
                {markers.map((marker) => (
                  <g
                    key={marker.id}
                    onClick={() => { setSelectedCluster(null); setSelectedId(marker.id); }}
                    className="cursor-pointer"
                  >
                    <circle cx={marker.x} cy={marker.y} r={marker.interactiveRadius} fill="transparent" />
                    <circle
                      cx={marker.x}
                      cy={marker.y}
                      r={marker.haloRadius}
                      fill={marker.color}
                      opacity={marker.haloOpacity}
                    />
                    <circle
                      cx={marker.x}
                      cy={marker.y}
                      r={marker.radius}
                      fill={marker.color}
                      opacity={marker.coreOpacity}
                    />
                    {marker.isSelected ? (
                      <circle
                        cx={marker.x}
                        cy={marker.y}
                        r={marker.ringRadius}
                        fill="none"
                        stroke="rgba(247,248,253,0.95)"
                        strokeWidth="1.2"
                        opacity="0.92"
                      />
                    ) : null}
                  </g>
                ))}
              </svg>
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-white/46">
                {loading ? "Loading conflict-map module..." : error}
              </div>
            )}
          </div>

          {selectedFeature ? (
            <div className="absolute inset-x-3 bottom-3 z-10 rounded-[20px] border border-white/12 bg-[rgba(8,12,22,0.90)] p-4 shadow-[0_8px_32px_rgba(0,0,0,0.6)] backdrop-blur-[20px]">
              <div className="flex items-start gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold text-white">
                      {selectedFeature.properties.locationName ||
                        getDisplayTitle(selectedFeature)}
                    </span>
                    <ConflictBadge tone={getSeverityKey(selectedFeature)}>
                      {selectedFeature.properties.severityLabel}
                    </ConflictBadge>
                  </div>
                  <div className="mt-1 text-xs text-white/44">
                    {selectedFeature.properties.country} ·{" "}
                    {formatTimestamp(selectedFeature.properties.date)}
                  </div>
                  {selectedFeature.properties.topArticles?.length > 0 ? (
                    <div className="mt-3 space-y-1.5">
                      {selectedFeature.properties.topArticles.slice(0, 2).map((article) => (
                        <a
                          key={article.url}
                          href={article.url}
                          target="_blank"
                          rel="noreferrer"
                          className="flex items-start gap-1.5 text-xs text-violet-300/80 transition-colors hover:text-violet-200"
                        >
                          <span className="mt-0.5 shrink-0 text-violet-400/60">↗</span>
                          <span className="line-clamp-1">
                            {article.displayTitle || article.title}
                          </span>
                        </a>
                      ))}
                    </div>
                  ) : null}
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedId(null)}
                  className="shrink-0 text-xl leading-none text-white/30 transition-colors hover:text-white"
                  aria-label="Close"
                >
                  ×
                </button>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    );
  }

  // ─── Full render ──────────────────────────────────────────────────────────

  return (
    <div
      ref={containerRef}
      className="relative h-full overflow-hidden rounded-[20px] bg-[rgb(7,10,18)] text-[rgb(236,239,248)]"
    >
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(132,96,255,0.14),transparent_28%),radial-gradient(circle_at_85%_12%,rgba(63,209,255,0.08),transparent_20%)] opacity-80" />
      <div className="pointer-events-none absolute inset-0 shadow-[inset_0_0_120px_rgba(0,0,0,0.6)]" />

      {/* Map canvas */}
      <div className="absolute inset-0">
        {mapLayers ? (
          <svg
            ref={svgCallbackRef}
            viewBox={`0 0 ${viewport.width} ${viewport.height}`}
            className="h-full w-full touch-none select-none cursor-grab active:cursor-grabbing"
            aria-label="Bundled vector world conflict map"
          >
            <defs>
              <filter id="cm-density-glow" x="-50%" y="-50%" width="200%" height="200%">
                <feGaussianBlur stdDeviation="14" />
              </filter>
              <filter
                id="cm-density-glow-lite"
                x="-36%"
                y="-36%"
                width="172%"
                height="172%"
              >
                <feGaussianBlur stdDeviation="8" />
              </filter>
              <filter id="cm-point-glow" x="-120%" y="-120%" width="340%" height="340%">
                <feGaussianBlur stdDeviation="4.5" />
              </filter>
            </defs>

            <linearGradient
              id="cm-ocean"
              x1="0%"
              y1="0%"
              x2="100%"
              y2="100%"
              gradientUnits="userSpaceOnUse"
            >
              <stop offset="0%" stopColor="rgba(9,12,20,0.98)" />
              <stop offset="100%" stopColor="rgba(4,7,14,0.88)" />
            </linearGradient>

            <rect width={viewport.width} height={viewport.height} fill="url(#cm-ocean)" />

            <g ref={viewportGroupRef}>
              <path
                d={mapLayers.graticulePath}
                fill="none"
                stroke="rgba(180,190,214,0.08)"
                strokeWidth="0.7"
                strokeDasharray="2 10"
              />
              <path d={mapLayers.landPath} fill="rgba(14,18,31,0.96)" />
              {mapLayers.countryPaths.map((item) => (
                <path
                  key={item.id}
                  d={item.path}
                  fill={
                    item.tone === 0
                      ? "rgba(19,25,39,0.98)"
                      : item.tone === 2
                        ? "rgba(16,21,34,0.98)"
                        : "rgba(14,18,31,0.96)"
                  }
                  stroke="rgba(0,0,0,0)"
                />
              ))}
              <path
                d={mapLayers.borderPath}
                fill="none"
                stroke="rgba(205,214,233,0.18)"
                strokeWidth="0.85"
              />

              {/* Continent labels */}
              {strategicLabels.map((label) => (
                <g key={label.label} transform={`translate(${label.x} ${label.y})`}>
                  <circle r="2" fill="rgba(235,238,248,0.14)" />
                  <text
                    dx="9"
                    dy="4"
                    fill="rgba(198,206,226,0.48)"
                    fontSize="11"
                    letterSpacing="0.14em"
                    pointerEvents="none"
                  >
                    {label.label}
                  </text>
                </g>
              ))}

              {/* Density halos */}
              {densityEnabled
                ? soloMarkers.map((marker) => (
                    <circle
                      key={`density-${marker.id}`}
                      cx={marker.x}
                      cy={marker.y}
                      r={marker.densityRadius * densityProfile.radiusScale}
                      fill={marker.color}
                      opacity={marker.densityOpacity * densityProfile.opacityScale}
                      filter={densityProfile.filterId ?? undefined}
                      pointerEvents="none"
                    />
                  ))
                : null}

              {/* Cluster markers */}
              {clusters.map((cluster) => (
                <g
                  key={cluster.id}
                  transform={`translate(${cluster.x} ${cluster.y})`}
                  className="cursor-pointer"
                  role="button"
                  tabIndex={0}
                  aria-label={`${cluster.count} events in this area`}
                  onClick={() => handleClusterClick(cluster)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      handleClusterClick(cluster);
                    }
                  }}
                >
                  <title>{cluster.count} events — click to zoom in</title>
                  <circle r={14} fill={cluster.color} opacity="0.18" filter="url(#cm-point-glow)" />
                  <circle
                    r={9}
                    fill={cluster.color}
                    opacity="0.78"
                    stroke="rgba(246,248,254,0.7)"
                    strokeWidth="1.2"
                  />
                  <text
                    textAnchor="middle"
                    dominantBaseline="central"
                    fill="rgba(6,9,16,0.95)"
                    fontSize="7.5"
                    fontWeight="700"
                    letterSpacing="0"
                  >
                    {cluster.count > 99 ? "99+" : cluster.count}
                  </text>
                </g>
              ))}

              {/* Individual markers */}
              {soloMarkers.map((marker) => (
                <g
                  key={marker.id}
                  transform={`translate(${marker.x} ${marker.y})`}
                  className="cursor-pointer"
                  role="button"
                  tabIndex={0}
                  aria-label={
                    marker.feature.properties.locationName || marker.feature.properties.title
                  }
                  onClick={() => { setSelectedCluster(null); setSelectedId(marker.id); }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      setSelectedCluster(null);
                      setSelectedId(marker.id);
                    }
                  }}
                >
                  <title>
                    {marker.feature.properties.locationName || marker.feature.properties.title}
                  </title>
                  {marker.isSelected ? (
                    <circle
                      r={marker.ringRadius + 3}
                      fill={marker.color}
                      opacity="0.1"
                      filter="url(#cm-point-glow)"
                    />
                  ) : null}
                  {!reducedMotion &&
                  marker.precisionVariant === "exact" &&
                  marker.feature.properties.dataKind === "hotspot" ? (
                    <circle r={marker.pulseRadius} fill={marker.color} opacity="0.08" />
                  ) : null}
                  <circle
                    r={marker.haloRadius}
                    fill={marker.color}
                    opacity={marker.haloOpacity}
                    filter="url(#cm-point-glow)"
                  />
                  <circle
                    r={marker.radius}
                    fill={marker.color}
                    opacity={marker.coreOpacity}
                    stroke="rgba(246,248,254,0.78)"
                    strokeWidth={marker.strokeWidth}
                  />
                  {marker.isSelected ? (
                    <circle
                      r={marker.ringRadius}
                      fill="none"
                      stroke="rgba(247,248,253,0.95)"
                      strokeWidth="1.2"
                      opacity="0.92"
                    />
                  ) : null}
                  <circle r={marker.interactiveRadius} fill="transparent" stroke="transparent" />
                </g>
              ))}
            </g>
          </svg>
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-white/52">
            {loading ? "Loading conflict-map module..." : error}
          </div>
        )}

        {/* Zoom controls */}
        <div className="pointer-events-auto absolute bottom-14 right-3 z-10 flex flex-col gap-1">
          <button
            type="button"
            onClick={handleZoomIn}
            aria-label="Zoom in"
            className="flex h-9 w-9 items-center justify-center rounded-2xl border border-white/10 bg-black/40 text-white backdrop-blur-md transition-colors hover:bg-white/12 active:bg-white/18"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
              <path d="M7 2v10M2 7h10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          </button>
          <button
            type="button"
            onClick={handleZoomOut}
            aria-label="Zoom out"
            className="flex h-9 w-9 items-center justify-center rounded-2xl border border-white/10 bg-black/40 text-white backdrop-blur-md transition-colors hover:bg-white/12 active:bg-white/18"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
              <path d="M2 7h10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          </button>
          <button
            type="button"
            onClick={handleResetView}
            aria-label="Reset view"
            title="Reset to world view"
            className="flex h-9 w-9 items-center justify-center rounded-2xl border border-white/10 bg-black/40 text-white/70 backdrop-blur-md transition-colors hover:bg-white/12 hover:text-white active:bg-white/18"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
              <circle cx="7" cy="7" r="5" stroke="currentColor" strokeWidth="1.6" />
              <circle cx="7" cy="7" r="1.5" fill="currentColor" />
            </svg>
          </button>
        </div>

        {/* Offline overlay */}
        {isOffline ? (
          <div className="pointer-events-auto absolute inset-0 z-30 flex items-center justify-center bg-black/50 backdrop-blur-sm">
            <div className="mx-4 max-w-sm rounded-[28px] border border-white/10 bg-[rgba(12,17,30,0.92)] p-8 text-center shadow-[0_18px_42px_rgba(3,7,20,0.6)] backdrop-blur-[24px]">
              <p className="text-lg font-semibold text-white">Server currently offline</p>
              <p className="mt-2 text-sm text-white/56">Map will be back online ASAP.</p>
              <button
                type="button"
                onClick={() => setRefreshToken((c) => c + 1)}
                className="mt-5 rounded-2xl border border-white/12 bg-white/8 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-white/14"
              >
                Retry now
              </button>
            </div>
          </div>
        ) : null}
      </div>

      {/* Left panel */}
      <aside className="pointer-events-auto absolute left-3 top-3 z-20 flex max-h-[calc(100%-1.5rem)] w-[min(22rem,calc(100%-1.5rem))] flex-col overflow-hidden rounded-[24px] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.08),rgba(255,255,255,0.04)),rgba(12,17,30,0.82)] shadow-[0_18px_42px_rgba(3,7,20,0.58),inset_0_1px_0_rgba(255,255,255,0.06),0_0_42px_rgba(125,84,255,0.12)] backdrop-blur-[24px]">
        <div className="border-b border-white/8 px-5 py-5">
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-violet-200/85">
            IntelliTrade Signal Deck
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-white">
            IntelliConflict
          </h1>
          <p className="mt-2 max-w-sm text-sm leading-6 text-white/56">
            Live risk signals from global news flow.
          </p>
          {/* Mini severity summary */}
          <div className="mt-4 grid grid-cols-3 gap-2">
            {(["high", "medium", "low"]).map((sk) => (
              <div key={sk} className="rounded-[14px] border border-white/8 bg-white/4 px-3 py-2 text-center">
                <div className="text-[10px] uppercase tracking-[0.16em] text-white/36">
                  {sk.charAt(0).toUpperCase() + sk.slice(1)}
                </div>
                <div className="mt-1 text-base font-semibold text-white">
                  {loading ? "—" : stats.severityBuckets[sk]}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto px-5 py-5">
          <section className="space-y-3">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/48">
              Time window
            </p>
            <ConflictSegmented
              options={WINDOW_OPTIONS}
              value={windowValue}
              onChange={setWindowValue}
            />
          </section>

          <section className="space-y-3">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/48">
              Severity
            </p>
            <div className="flex flex-wrap gap-2">
              {SEVERITY_OPTIONS.map((option) => (
                <ConflictChip
                  key={option.value}
                  active={
                    option.value === "all"
                      ? activeSeverities.size === 0
                      : activeSeverities.has(option.value)
                  }
                  onClick={() => toggleSeverity(option.value)}
                >
                  {option.label}
                </ConflictChip>
              ))}
            </div>
          </section>

          <section className="space-y-3">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/48">
              Categories
            </p>
            <div className="flex flex-wrap gap-2">
              {CATEGORY_DEFINITIONS.map((category) => (
                <ConflictChip
                  key={category.id}
                  active={activeCategories.includes(category.id)}
                  onClick={() => toggleCategory(category.id)}
                >
                  {category.label}
                </ConflictChip>
              ))}
            </div>
          </section>

          <section className="space-y-3">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/48">
              Search
            </p>
            <ConflictSearchField value={query} onChange={setQuery} />
          </section>

          <section className="space-y-4 rounded-[24px] border border-white/8 bg-white/4 p-4">
            <div className="flex items-end justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/48">
                  Total events
                </p>
                <p className="mt-2 text-3xl font-semibold text-white">
                  {loading ? "..." : visibleFeatures.length.toLocaleString()}
                </p>
              </div>
              <div className="rounded-2xl border border-white/8 bg-black/20 px-3 py-2 text-right">
                <p className="text-[11px] uppercase tracking-[0.16em] text-white/48">Density</p>
                <p className="mt-1 text-sm font-semibold text-white">
                  {visibleFeatures.length >= 120
                    ? "Elevated"
                    : visibleFeatures.length >= 40
                      ? "Active"
                      : "Watching"}
                </p>
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs uppercase tracking-[0.16em] text-white/48">
                <span>Severity distribution</span>
                <span>{totalSeverityCount.toLocaleString()} tracked</span>
              </div>
              <div className="flex h-3 overflow-hidden rounded-full bg-white/6">
                <div
                  className="bg-emerald-400/70"
                  style={{ width: `${percentage(stats.severityBuckets.low, totalSeverityCount)}%` }}
                />
                <div
                  className="bg-amber-300/80"
                  style={{
                    width: `${percentage(stats.severityBuckets.medium, totalSeverityCount)}%`,
                  }}
                />
                <div
                  className="bg-rose-400/80"
                  style={{
                    width: `${percentage(stats.severityBuckets.high, totalSeverityCount)}%`,
                  }}
                />
              </div>
              <div className="grid grid-cols-3 gap-2 text-xs text-white/48">
                <span>Low {stats.severityBuckets.low}</span>
                <span>Medium {stats.severityBuckets.medium}</span>
                <span>High {stats.severityBuckets.high}</span>
              </div>
            </div>

            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-white/48">
                Top countries
              </p>
              <div className="space-y-2">
                {(stats.topCountries.length
                  ? stats.topCountries
                  : [{ name: "No data", count: 0 }]
                ).map((country) => (
                  <div
                    key={country.name}
                    className="flex items-center justify-between rounded-2xl border border-white/6 bg-white/4 px-3 py-2"
                  >
                    <span className="text-sm text-white">{country.name}</span>
                    <span className="text-xs font-semibold text-white/48">
                      {loading ? "-" : country.count}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </section>
        </div>
      </aside>

      {/* Top-right controls */}
      <div className="pointer-events-auto absolute right-3 top-3 z-20 flex max-w-[calc(100%-1.5rem)] items-start gap-3">
        <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.08),rgba(255,255,255,0.04)),rgba(12,17,30,0.72)] px-3 py-3 shadow-[0_18px_42px_rgba(3,7,20,0.58),inset_0_1px_0_rgba(255,255,255,0.06),0_0_42px_rgba(125,84,255,0.12)] backdrop-blur-[24px]">
          <ConflictButton
            variant="secondary"
            onClick={() => setRefreshToken((c) => c + 1)}
            title="Fetch latest data from GDELT."
          >
            <RotateCw className="mr-2 h-4 w-4" />
            Refresh
          </ConflictButton>
          <ConflictButton
            variant={densityEnabled ? "primary" : "secondary"}
            onClick={() => setDensityEnabled((c) => !c)}
          >
            Density
          </ConflictButton>
          {isSample ? <ConflictBadge tone="sample">Sample data</ConflictBadge> : null}
          {isStale ? <ConflictBadge tone="medium">Showing cached data</ConflictBadge> : null}
          {error ? <ConflictBadge tone="medium">{error}</ConflictBadge> : null}
          <div className="min-w-[9rem] text-right">
            <p className="text-[11px] uppercase tracking-[0.18em] text-white/48">Last updated</p>
            <p className="mt-1 text-sm font-medium text-white">
              {generatedAt ? formatTimestamp(generatedAt) : loading ? "Loading..." : "--"}
            </p>
          </div>
        </div>
      </div>

      {/* ── Right detail drawer — single event ────────────────────────── */}
      <aside
        className={cn(
          "pointer-events-auto absolute bottom-3 right-3 top-3 z-20 w-[min(22rem,calc(100%-1.5rem))] rounded-[24px] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.08),rgba(255,255,255,0.04)),rgba(12,17,30,0.82)] shadow-[0_18px_42px_rgba(3,7,20,0.58),inset_0_1px_0_rgba(255,255,255,0.06),0_0_42px_rgba(125,84,255,0.12)] backdrop-blur-[24px] transition-transform duration-200",
          selectedFeature && !selectedCluster ? "translate-x-0" : "translate-x-[110%]"
        )}
        aria-hidden={!selectedFeature || !!selectedCluster}
      >
        <div className="flex h-full flex-col">
          <div className="flex items-start justify-between border-b border-white/8 px-5 py-5">
            <div className="min-w-0 flex-1 pr-3">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/48">
                {selectedFeature?.properties.dataKind === "hotspot"
                  ? "Hotspot"
                  : "Article-derived signal"}
              </p>
              {/* Primary title: the actual event headline, never the country name */}
              <h2 className="mt-2 text-xl font-semibold leading-snug text-white">
                {selectedFeature ? getDisplayTitle(selectedFeature) : "Select a signal"}
              </h2>
              {/* Show original text when translated */}
              {selectedFeature?.properties.wasTranslated &&
              selectedFeature.properties.displayTitle &&
              selectedFeature.properties.displayTitle !== selectedFeature.properties.title ? (
                <p className="mt-1 text-xs italic text-white/40">
                  Translated · Original: {selectedFeature.properties.title}
                </p>
              ) : null}
              {/* Location as secondary context */}
              {(selectedFeature?.properties.locationName || selectedFeature?.properties.country) ? (
                <p className="mt-2 text-sm text-white/56">
                  {[selectedFeature.properties.locationName, selectedFeature.properties.country]
                    .filter(Boolean)
                    .join(", ")}
                </p>
              ) : null}
            </div>
            <ConflictButton variant="ghost" onClick={() => setSelectedId(null)}>
              Close
            </ConflictButton>
          </div>

          <div className="flex-1 space-y-5 overflow-y-auto px-5 py-5">
            {selectedFeature ? (
              <>
                {/* Severity + metadata card */}
                <section className="space-y-3 rounded-[24px] border border-white/8 bg-white/4 p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <ConflictBadge tone={getSeverityKey(selectedFeature)}>
                      {selectedFeature.properties.severityLabel}
                    </ConflictBadge>
                    {selectedFeature.properties.dataKind === "hotspot" ? (
                      <span className="rounded-full border border-white/10 bg-white/6 px-3 py-1 text-sm text-white/90">
                        Mentions {selectedFeature.properties.hotspotCount ?? 1}
                      </span>
                    ) : null}
                    <span className="text-sm text-white/90">
                      Score {selectedFeature.properties.severityScore}
                    </span>
                  </div>
                  <div className="space-y-1 text-sm text-white/56">
                    <p>{formatRelativeTime(selectedFeature.properties.date)}</p>
                    <p>{formatTimestamp(selectedFeature.properties.date)}</p>
                    {selectedFeature.properties.locationPrecision === "country" ? (
                      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-amber-100/80">
                        Approximate location (country-level)
                      </p>
                    ) : null}
                  </div>
                  {selectedFeature.properties.severityReasons?.length ? (
                    <ul className="mt-2 space-y-1">
                      {selectedFeature.properties.severityReasons.map((reason) => (
                        <li key={reason} className="flex items-start gap-1.5 text-xs text-white/50">
                          <span className="mt-0.5 shrink-0 text-white/28">·</span>
                          {reason}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </section>

                {/* Articles — shown for BOTH hotspot and article types */}
                {selectedFeature.properties.topArticles?.length ? (
                  <section className="space-y-3 rounded-[24px] border border-white/8 bg-white/4 p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/48">
                      {selectedFeature.properties.dataKind === "hotspot"
                        ? "Top articles"
                        : "Source"}
                    </p>
                    <div className="space-y-2">
                      {selectedFeature.properties.topArticles.map((article) => (
                        <a
                          key={article.url ?? article.title}
                          href={article.url ?? undefined}
                          target="_blank"
                          rel="noreferrer"
                          className={cn(
                            "block rounded-2xl border border-white/8 bg-white/4 px-3 py-3 text-sm text-white transition-colors duration-200",
                            article.url
                              ? "hover:border-white/14 hover:bg-white/8"
                              : "cursor-default opacity-60"
                          )}
                        >
                          <span className="block leading-snug">
                            {article.displayTitle || article.title}
                          </span>
                          {article.wasTranslated ? (
                            <span className="mt-1 block text-xs text-white/36">
                              Translated from {article.translatedFrom || "original language"}
                            </span>
                          ) : null}
                          {!article.url ? (
                            <span className="mt-1 block text-xs text-white/36">
                              No source URL available
                            </span>
                          ) : null}
                        </a>
                      ))}
                    </div>
                  </section>
                ) : selectedFeature.properties.dataKind === "article" ? (
                  <section className="rounded-[24px] border border-white/8 bg-white/4 px-4 py-3">
                    <p className="text-sm text-white/46">No source URL available for this item.</p>
                  </section>
                ) : null}

                {/* Tags */}
                {selectedFeature.properties.tags?.length ? (
                  <section className="space-y-3">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/48">
                      Tags
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {selectedFeature.properties.tags.map((tag) => (
                        <ConflictChip key={tag}>{tag}</ConflictChip>
                      ))}
                    </div>
                  </section>
                ) : null}

                {/* Themes — only when distinct from tags */}
                {selectedFeature.properties.themes?.length &&
                JSON.stringify(selectedFeature.properties.themes) !==
                  JSON.stringify(selectedFeature.properties.tags) ? (
                  <section className="space-y-3">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/48">
                      Themes
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {selectedFeature.properties.themes.map((theme) => (
                        <ConflictChip key={theme}>{theme}</ConflictChip>
                      ))}
                    </div>
                  </section>
                ) : null}
              </>
            ) : (
              <div className="flex h-full items-center justify-center text-center text-sm text-white/56">
                Pick a cluster or event marker to inspect the signal.
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3 border-t border-white/8 px-5 py-5">
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
            <ConflictButton variant="secondary" disabled={!selectedFeature} onClick={copySummary}>
              {copied ? "Copied" : "Copy summary"}
            </ConflictButton>
          </div>
        </div>
      </aside>

      {/* ── Group drawer — multi-event cluster ─────────────────────────── */}
      <aside
        className={cn(
          "pointer-events-auto absolute bottom-3 right-3 top-3 z-20 w-[min(22rem,calc(100%-1.5rem))] rounded-[24px] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.08),rgba(255,255,255,0.04)),rgba(12,17,30,0.82)] shadow-[0_18px_42px_rgba(3,7,20,0.58),inset_0_1px_0_rgba(255,255,255,0.06),0_0_42px_rgba(125,84,255,0.12)] backdrop-blur-[24px] transition-transform duration-200",
          selectedCluster ? "translate-x-0" : "translate-x-[110%]"
        )}
        aria-hidden={!selectedCluster}
      >
        <div className="flex h-full flex-col">
          <div className="flex items-start justify-between border-b border-white/8 px-5 py-5">
            <div className="min-w-0 flex-1 pr-3">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/48">
                Event cluster
              </p>
              <h2 className="mt-2 text-xl font-semibold text-white">
                {selectedCluster?.count ?? 0} events in this area
              </h2>
              <p className="mt-1 text-sm text-white/56">
                Click an event below to inspect details.
              </p>
            </div>
            <ConflictButton variant="ghost" onClick={() => setSelectedCluster(null)}>
              Close
            </ConflictButton>
          </div>

          <div className="flex-1 overflow-y-auto px-4 py-4">
            <div className="space-y-2">
              {(selectedCluster?.events ?? []).map((feature) => {
                const sk = getSeverityKey(feature);
                return (
                  <button
                    key={String(feature.id)}
                    type="button"
                    className="w-full rounded-[18px] border border-white/8 bg-white/4 px-4 py-3 text-left transition-colors hover:border-white/14 hover:bg-white/8"
                    onClick={() => handleClusterEventSelect(feature)}
                  >
                    <div className="flex items-start gap-3">
                      <div
                        className="mt-1 h-2 w-2 shrink-0 rounded-full"
                        style={{ backgroundColor: severityColor(feature.properties.severityScore) }}
                      />
                      <div className="min-w-0 flex-1">
                        <p className="line-clamp-2 text-sm font-medium leading-snug text-white">
                          {getDisplayTitle(feature)}
                        </p>
                        <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-white/46">
                          {feature.properties.country ? (
                            <span>{feature.properties.country}</span>
                          ) : null}
                          <ConflictBadge tone={sk}>
                            {feature.properties.severityLabel}
                          </ConflictBadge>
                          {feature.properties.date ? (
                            <span>{formatRelativeTime(feature.properties.date)}</span>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </aside>

    </div>
  );
}

export default function ConflictMapPage() {
  return <ConflictMapSurface />;
}
