"use client";

import {
  startTransition,
  useDeferredValue,
  useEffect,
  useMemo,
  useState
} from "react";

import { MapView } from "@/components/Map/MapView";
import { LeftPanel } from "@/components/Panels/LeftPanel";
import { RightDrawer } from "@/components/Panels/RightDrawer";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Tooltip } from "@/components/ui/Tooltip";
import type {
  ConflictFeature,
  ConflictFeatureCollection,
  ConflictsResponse,
  ConflictWindow,
  SeverityFilter
} from "@/lib/schema";
import { CATEGORY_DEFINITIONS, type CategoryId } from "@/lib/scoring";
import {
  buildConflictStats,
  matchesSearch
} from "@/lib/utils";

type DataState = "live" | "stale" | "offline" | "loading";

export function ConflictMapPage() {
  const [windowValue, setWindowValue] = useState<ConflictWindow>("24h");
  const [severity, setSeverity] = useState<SeverityFilter>("all");
  const [search, setSearch] = useState("");
  const [activeCategories, setActiveCategories] = useState<CategoryId[]>([]);
  const [densityEnabled, setDensityEnabled] = useState(true);
  const [response, setResponse] = useState<ConflictsResponse | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [refreshToken, setRefreshToken] = useState(0);
  const [loading, setLoading] = useState(true);
  const [dataState, setDataState] = useState<DataState>("loading");
  const [reducedMotion, setReducedMotion] = useState(false);
  const deferredSearch = useDeferredValue(search);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const handleChange = () => setReducedMotion(mediaQuery.matches);

    handleChange();
    mediaQuery.addEventListener("change", handleChange);
    return () => mediaQuery.removeEventListener("change", handleChange);
  }, []);

  useEffect(() => {
    const controller = new AbortController();

    async function loadSignals() {
      setLoading(true);
      setDataState("loading");

      try {
        const nextUrl = new URL("/api/conflicts", window.location.origin);
        nextUrl.searchParams.set("window", windowValue);
        nextUrl.searchParams.set("severity", severity);

        const res = await fetch(nextUrl.toString(), {
          cache: "no-store",
          signal: controller.signal
        });

        if (!res.ok) {
          const errorBody = (await res.json().catch(() => null)) as {
            error?: string;
          } | null;
          throw new Error(
            errorBody?.error ?? "Unable to load conflict signals."
          );
        }

        const payload = (await res.json()) as ConflictsResponse;
        setResponse(payload);

        // Determine data state from meta source
        const source = payload.meta.source;
        if (source === "offline") {
          setDataState("offline");
        } else if (source === "stale") {
          setDataState("stale");
        } else {
          setDataState("live");
        }
      } catch (error) {
        if ((error as Error).name === "AbortError") {
          return;
        }
        // Network-level failure: preserve previous data as stale or go offline
        setDataState((current) =>
          current === "live" || current === "stale" ? "stale" : "offline"
        );
      } finally {
        setLoading(false);
      }
    }

    void loadSignals();

    return () => controller.abort();
  }, [refreshToken, severity, windowValue]);

  const visibleCollection = useMemo<ConflictFeatureCollection>(() => {
    const baseFeatures = response?.geojson.features ?? [];
    const nextFeatures = baseFeatures.filter((feature) => {
      if (!matchesSearch(feature, deferredSearch)) {
        return false;
      }

      if (activeCategories.length === 0) {
        return true;
      }

      return activeCategories.some((categoryId) => {
        const category = CATEGORY_DEFINITIONS.find(
          (candidate) => candidate.id === categoryId
        );

        if (!category) {
          return false;
        }

        return feature.properties.tags.includes(category.label);
      });
    });

    return {
      type: "FeatureCollection",
      features: nextFeatures
    };
  }, [activeCategories, deferredSearch, response?.geojson.features]);

  // If filtered selection is no longer visible, deselect
  const selectedFeature =
    visibleCollection.features.find(
      (feature) => String(feature.id) === selectedId
    ) ?? null;

  const stats = useMemo(
    () =>
      visibleCollection.features.length > 0
        ? buildConflictStats(visibleCollection)
        : (response?.stats ?? {
            topCountries: [],
            topThemes: [],
            severityBuckets: { low: 0, medium: 0, high: 0 }
          }),
    [response?.stats, visibleCollection]
  );

  const lastUpdated = response?.meta.generatedAt;
  const isOffline = dataState === "offline";
  const isStale = dataState === "stale";

  function toggleCategory(categoryId: CategoryId) {
    setActiveCategories((current) =>
      current.includes(categoryId)
        ? current.filter((value) => value !== categoryId)
        : [...current, categoryId]
    );
  }

  function handleRefresh() {
    startTransition(() => {
      setRefreshToken((current) => current + 1);
    });
  }

  function handleSelect(feature: ConflictFeature) {
    setSelectedId(String(feature.id));
  }

  function handleSeverityChange(value: SeverityFilter) {
    setSeverity(value);
    // If the currently selected feature would be filtered out, deselect
    if (selectedFeature) {
      const featureSeverity =
        selectedFeature.properties.severityLabel.toLowerCase();
      if (value !== "all" && featureSeverity !== value) {
        setSelectedId(null);
      }
    }
  }

  function handleWindowChange(value: ConflictWindow) {
    setWindowValue(value);
    setSelectedId(null);
  }

  return (
    <main className="relative min-h-screen overflow-hidden">
      <MapView
        data={visibleCollection}
        densityEnabled={densityEnabled && !isOffline}
        onSelect={handleSelect}
        reducedMotion={reducedMotion}
        selectedFeatureId={selectedId}
      />

      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.04),transparent_40%),linear-gradient(180deg,rgba(6,9,16,0.18),rgba(6,9,16,0.68))]" />

      <LeftPanel
        activeCategories={activeCategories}
        categoryOptions={CATEGORY_DEFINITIONS.map(({ id, label }) => ({
          id,
          label
        }))}
        lastUpdated={lastUpdated}
        loading={loading}
        onCategoryToggle={toggleCategory}
        onSearchChange={(value) => startTransition(() => setSearch(value))}
        onSeverityChange={handleSeverityChange}
        onWindowChange={handleWindowChange}
        search={search}
        severity={severity}
        stats={stats}
        totalCount={visibleCollection.features.length}
        windowValue={windowValue}
      />

      {/* Top-right control bar */}
      <div className="pointer-events-auto absolute right-4 top-4 z-20 flex max-w-[calc(100vw-2rem)] items-start gap-3">
        <div className="glass-panel flex flex-wrap items-center gap-2 rounded-2xl px-3 py-3">
          <Tooltip content="Refreshes the live cache-backed dataset.">
            <Button variant="secondary" size="sm" onClick={handleRefresh}>
              Refresh
            </Button>
          </Tooltip>
          <Button
            variant={densityEnabled ? "primary" : "secondary"}
            size="sm"
            onClick={() => setDensityEnabled((current) => !current)}
          >
            Density
          </Button>
          {/* Stale data notice */}
          {isStale ? (
            <Badge tone="medium">
              Live refresh unavailable — showing latest available data
            </Badge>
          ) : null}
          <div className="min-w-[9rem] text-right">
            <p className="text-[11px] uppercase tracking-[0.18em] text-muted">
              Last updated
            </p>
            <p className="mt-1 text-sm font-medium text-white">
              {lastUpdated
                ? new Intl.DateTimeFormat("en", {
                    dateStyle: "medium",
                    timeStyle: "short"
                  }).format(new Date(lastUpdated))
                : loading
                  ? "Loading..."
                  : "—"}
            </p>
          </div>
        </div>
      </div>

      <RightDrawer
        feature={selectedFeature}
        onClose={() => setSelectedId(null)}
        windowValue={windowValue}
      />

      {/* Offline overlay — shown when no data is available at all */}
      {isOffline ? (
        <div className="pointer-events-auto absolute inset-0 z-40 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="glass-panel mx-4 max-w-sm rounded-[28px] p-8 text-center">
            <div className="mb-4 text-4xl">⚡</div>
            <h2 className="text-xl font-semibold text-white">
              Server currently offline, map will be back online ASAP
            </h2>
            <p className="mt-3 text-sm leading-6 text-muted">
              Live conflict signals are temporarily unavailable. The map will
              resume automatically when service is restored.
            </p>
            <button
              type="button"
              className="mt-6 rounded-2xl border border-white/12 bg-white/8 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-white/14"
              onClick={handleRefresh}
            >
              Retry now
            </button>
          </div>
        </div>
      ) : null}

      {/* Bottom attribution */}
      <div className="pointer-events-auto absolute bottom-4 left-4 z-20 flex max-w-[min(28rem,calc(100vw-2rem))] flex-wrap items-center gap-3">
        <div className="glass-panel rounded-full px-3 py-2 text-xs uppercase tracking-[0.18em] text-muted">
          Data: GDELT
        </div>
        <div className="glass-panel rounded-full px-3 py-2 text-xs uppercase tracking-[0.18em] text-muted">
          Bundled basemap: Natural Earth
        </div>
      </div>
    </main>
  );
}
