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
  formatTimestamp,
  matchesSearch
} from "@/lib/utils";

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
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
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
      setErrorMessage(null);

      try {
        const nextUrl = new URL("/api/conflicts", window.location.origin);
        nextUrl.searchParams.set("window", windowValue);
        nextUrl.searchParams.set("severity", severity);

        const response = await fetch(nextUrl.toString(), {
          cache: "no-store",
          signal: controller.signal
        });

        if (!response.ok) {
          const errorBody = (await response.json().catch(() => null)) as {
            error?: string;
          } | null;
          throw new Error(
            errorBody?.error ?? "Unable to load conflict signals."
          );
        }

        const payload = (await response.json()) as ConflictsResponse;
        setResponse(payload);

        if (
          selectedId &&
          !payload.geojson.features.some(
            (feature) => String(feature.id) === selectedId
          )
        ) {
          setSelectedId(null);
        }
      } catch (error) {
        if ((error as Error).name === "AbortError") {
          return;
        }

        setErrorMessage((error as Error).message);
      } finally {
        setLoading(false);
      }
    }

    void loadSignals();

    return () => controller.abort();
  }, [refreshToken, selectedId, severity, windowValue]);

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
  const isSample = response?.meta.source === "sample";

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

  return (
    <main className="relative min-h-screen overflow-hidden">
      <MapView
        data={visibleCollection}
        densityEnabled={densityEnabled}
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
        loading={loading}
        onCategoryToggle={toggleCategory}
        onSearchChange={(value) => startTransition(() => setSearch(value))}
        onSeverityChange={setSeverity}
        onWindowChange={setWindowValue}
        search={search}
        severity={severity}
        stats={stats}
        totalCount={visibleCollection.features.length}
        windowValue={windowValue}
      />

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
          {isSample && <Badge tone="sample">Sample data mode</Badge>}
          {errorMessage && <Badge tone="medium">{errorMessage}</Badge>}
          <div className="min-w-[9rem] text-right">
            <p className="text-[11px] uppercase tracking-[0.18em] text-muted">
              Last updated
            </p>
            <p className="mt-1 text-sm font-medium text-white">
              {lastUpdated ? formatTimestamp(lastUpdated) : "Loading..."}
            </p>
          </div>
        </div>
      </div>

      <RightDrawer
        feature={selectedFeature}
        onClose={() => setSelectedId(null)}
        windowValue={windowValue}
      />

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
