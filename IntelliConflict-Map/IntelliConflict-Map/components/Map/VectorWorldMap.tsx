"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent
} from "react";

import { select } from "d3-selection";
import {
  zoom,
  zoomIdentity,
  type ZoomBehavior,
  type ZoomTransform
} from "d3-zoom";

import { projectStrategicLabels } from "@/components/Map/labels";
import {
  clusterSvgMarkers,
  projectConflictMarkers,
  type ClusterMarker
} from "@/components/Map/hotspots";
import {
  getDensityProfile
} from "@/components/Map/density";
import {
  createProjectedPath,
  createViewportExtent,
  createWorldProjection,
  WORLD_BORDERS,
  WORLD_COUNTRIES,
  WORLD_GRATICULE,
  WORLD_LAND
} from "@/components/Map/projection";
import type { ConflictFeature, ConflictFeatureCollection } from "@/lib/schema";

type VectorWorldMapProps = {
  data: ConflictFeatureCollection;
  densityEnabled: boolean;
  onSelect: (feature: ConflictFeature) => void;
  reducedMotion: boolean;
  selectedFeatureId: string | null;
};

const DEFAULT_VIEWPORT = {
  width: 1440,
  height: 900
};

// Zoom in/out step multiplier
const ZOOM_STEP = 1.4;
// Grid size (in SVG units) for clustering at low zoom
const CLUSTER_GRID_SIZE = 26;
// Threshold: apply clustering when scale ≤ this value
const CLUSTER_SCALE_THRESHOLD = 2.2;

export function VectorWorldMap({
  data,
  densityEnabled,
  onSelect,
  reducedMotion,
  selectedFeatureId
}: VectorWorldMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const viewportRef = useRef<SVGGElement | null>(null);
  const zoomBehaviorRef = useRef<ZoomBehavior<SVGSVGElement, unknown> | null>(
    null
  );
  const animationFrameRef = useRef<number | null>(null);
  const transformRef = useRef<ZoomTransform>(zoomIdentity);
  const [viewport, setViewport] = useState(DEFAULT_VIEWPORT);
  // Triggers cluster/solo switch only when crossing CLUSTER_SCALE_THRESHOLD
  const [isZoomedOut, setIsZoomedOut] = useState(true);

  useEffect(() => {
    const node = containerRef.current;

    if (!node) {
      return;
    }

    const updateViewport = () => {
      const nextViewport = {
        width: node.clientWidth || DEFAULT_VIEWPORT.width,
        height: node.clientHeight || DEFAULT_VIEWPORT.height
      };

      setViewport((current) =>
        current.width === nextViewport.width &&
        current.height === nextViewport.height
          ? current
          : nextViewport
      );
    };

    updateViewport();

    if (typeof ResizeObserver === "undefined") {
      return;
    }

    const observer = new ResizeObserver(updateViewport);
    observer.observe(node);

    return () => observer.disconnect();
  }, []);

  const projection = useMemo(
    () => createWorldProjection(viewport.width, viewport.height),
    [viewport.height, viewport.width]
  );
  const geoPath = useMemo(() => createProjectedPath(projection), [projection]);
  const landPath = useMemo(() => geoPath(WORLD_LAND) ?? "", [geoPath]);
  const borderPath = useMemo(() => geoPath(WORLD_BORDERS) ?? "", [geoPath]);
  const graticulePath = useMemo(
    () => geoPath(WORLD_GRATICULE) ?? "",
    [geoPath]
  );
  const countryPaths = useMemo(
    () =>
      WORLD_COUNTRIES.map((country, index) => ({
        d: geoPath(country) ?? "",
        id: `${country.id ?? country.properties?.name ?? index}`,
        tone: index % 5
      })),
    [geoPath]
  );
  const labels = useMemo(
    () => projectStrategicLabels(projection),
    [projection]
  );
  const markers = useMemo(
    () =>
      projectConflictMarkers(data.features, projection, selectedFeatureId),
    [data.features, projection, selectedFeatureId]
  );

  // Clustering: group nearby markers at low zoom to reduce visual clutter
  const { soloMarkers, clusters } = useMemo(() => {
    if (!isZoomedOut) {
      return { soloMarkers: markers, clusters: [] as ClusterMarker[] };
    }
    return clusterSvgMarkers(markers, CLUSTER_GRID_SIZE);
  }, [isZoomedOut, markers]);

  // Density profile is based on all visible markers (including clustered)
  const densityProfile = useMemo(
    () => getDensityProfile(markers.length),
    [markers.length]
  );
  const markerLookup = useMemo(
    () => new Map(markers.map((marker) => [marker.id, marker])),
    [markers]
  );

  useEffect(() => {
    const svgNode = svgRef.current;
    const viewportNode = viewportRef.current;

    if (!svgNode || !viewportNode) {
      return;
    }

    const svg = select(svgNode);
    const behavior = zoom<SVGSVGElement, unknown>()
      .scaleExtent([1, 6])
      .extent([
        [0, 0],
        [viewport.width, viewport.height]
      ])
      .translateExtent(createViewportExtent(viewport.width, viewport.height))
      .filter((event) => event.type !== "dblclick")
      .on("zoom", (event) => {
        const k: number = (event.transform as ZoomTransform).k;
        const wasZoomedOut = transformRef.current.k <= CLUSTER_SCALE_THRESHOLD;
        const nowZoomedOut = k <= CLUSTER_SCALE_THRESHOLD;
        transformRef.current = event.transform as ZoomTransform;
        viewportNode.setAttribute(
          "transform",
          `translate(${(event.transform as ZoomTransform).x} ${(event.transform as ZoomTransform).y}) scale(${k})`
        );
        // Only update state when crossing the cluster threshold (avoids 60fps re-renders)
        if (wasZoomedOut !== nowZoomedOut) {
          setIsZoomedOut(nowZoomedOut);
        }
      });

    zoomBehaviorRef.current = behavior;
    svg.call(behavior as never);
    svg.call(behavior.transform as never, transformRef.current);

    return () => {
      svg.on(".zoom", null);
    };
  }, [viewport.height, viewport.width]);

  useEffect(
    () => () => {
      if (animationFrameRef.current !== null) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    },
    []
  );

  useEffect(() => {
    if (!selectedFeatureId) {
      return;
    }

    const selectedMarker = markerLookup.get(selectedFeatureId);
    const svgNode = svgRef.current;
    const behavior = zoomBehaviorRef.current;

    if (!selectedMarker || !svgNode || !behavior) {
      return;
    }

    const targetScale =
      selectedMarker.precisionVariant === "country"
        ? 1.75
        : selectedMarker.feature.properties.dataKind === "hotspot"
          ? 2.3
          : 2;
    const targetTransform = zoomIdentity
      .translate(
        viewport.width / 2 - selectedMarker.x * targetScale,
        viewport.height / 2 - selectedMarker.y * targetScale
      )
      .scale(targetScale);
    const svg = select(svgNode);

    if (reducedMotion) {
      svg.call(behavior.transform as never, targetTransform);
      return;
    }

    if (animationFrameRef.current !== null) {
      cancelAnimationFrame(animationFrameRef.current);
    }

    const startTransform = transformRef.current;
    const startTime = performance.now();
    const duration = 220;

    const tick = (timestamp: number) => {
      const progress = Math.min((timestamp - startTime) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      const interpolated = zoomIdentity
        .translate(
          startTransform.x + (targetTransform.x - startTransform.x) * eased,
          startTransform.y + (targetTransform.y - startTransform.y) * eased
        )
        .scale(startTransform.k + (targetTransform.k - startTransform.k) * eased);

      svg.call(behavior.transform as never, interpolated);

      if (progress < 1) {
        animationFrameRef.current = requestAnimationFrame(tick);
      }
    };

    animationFrameRef.current = requestAnimationFrame(tick);
  }, [
    markerLookup,
    reducedMotion,
    selectedFeatureId,
    viewport.height,
    viewport.width
  ]);

  function handleMarkerKeyDown(
    event: KeyboardEvent<SVGGElement>,
    feature: ConflictFeature
  ) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onSelect(feature);
    }
  }

  function animateToTransform(
    targetTransform: ZoomTransform,
    duration: number
  ) {
    const svgNode = svgRef.current;
    const behavior = zoomBehaviorRef.current;
    if (!svgNode || !behavior) return;
    const svg = select(svgNode);

    if (reducedMotion) {
      svg.call(behavior.transform as never, targetTransform);
      return;
    }

    if (animationFrameRef.current !== null) {
      cancelAnimationFrame(animationFrameRef.current);
    }

    const startTransform = transformRef.current;
    let startTime: number | null = null;

    const tick = (timestamp: number) => {
      if (startTime === null) startTime = timestamp;
      const progress = Math.min((timestamp - startTime) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      const interpolated = zoomIdentity
        .translate(
          startTransform.x + (targetTransform.x - startTransform.x) * eased,
          startTransform.y + (targetTransform.y - startTransform.y) * eased
        )
        .scale(startTransform.k + (targetTransform.k - startTransform.k) * eased);

      svg.call(behavior.transform as never, interpolated);

      if (progress < 1) {
        animationFrameRef.current = requestAnimationFrame(tick);
      }
    };

    animationFrameRef.current = requestAnimationFrame(tick);
  }

  function handleZoomIn() {
    const t = transformRef.current;
    const targetK = Math.min(t.k * ZOOM_STEP, 6);
    const cx = viewport.width / 2;
    const cy = viewport.height / 2;
    const kRatio = targetK / t.k;
    animateToTransform(
      zoomIdentity.translate(cx - (cx - t.x) * kRatio, cy - (cy - t.y) * kRatio).scale(targetK),
      200
    );
  }

  function handleZoomOut() {
    const t = transformRef.current;
    const targetK = Math.max(t.k / ZOOM_STEP, 1);
    const cx = viewport.width / 2;
    const cy = viewport.height / 2;
    const kRatio = targetK / t.k;
    animateToTransform(
      zoomIdentity.translate(cx - (cx - t.x) * kRatio, cy - (cy - t.y) * kRatio).scale(targetK),
      200
    );
  }

  function handleResetView() {
    animateToTransform(zoomIdentity, 300);
  }

  function handleClusterClick(cluster: ClusterMarker) {
    const targetK = Math.min(transformRef.current.k * 2.2, 6);
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

  return (
    <div ref={containerRef} className="absolute inset-0 overflow-hidden">
      <svg
        ref={svgRef}
        className="h-full w-full touch-none select-none cursor-grab active:cursor-grabbing"
        viewBox={`0 0 ${viewport.width} ${viewport.height}`}
        aria-label="Bundled vector world conflict map"
      >
        <defs>
          <filter id="map-density-glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="14" />
          </filter>
          <filter
            id="map-density-glow-lite"
            x="-36%"
            y="-36%"
            width="172%"
            height="172%"
          >
            <feGaussianBlur stdDeviation="8" />
          </filter>
          <filter id="map-point-glow" x="-120%" y="-120%" width="340%" height="340%">
            <feGaussianBlur stdDeviation="4.5" />
          </filter>
        </defs>

        <linearGradient id="map-ocean" x1="0%" y1="0%" x2="100%" y2="100%" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="rgba(9,12,20,0.98)" />
          <stop offset="100%" stopColor="rgba(4,7,14,0.88)" />
        </linearGradient>

        <rect width={viewport.width} height={viewport.height} fill="url(#map-ocean)" />

        <g ref={viewportRef}>
          <path
            d={graticulePath}
            fill="none"
            stroke="rgba(180,190,214,0.08)"
            strokeWidth="0.7"
            strokeDasharray="2 10"
          />

          <path d={landPath} fill="rgba(14,18,31,0.96)" />

          {countryPaths.map((country) => (
            <path
              key={country.id}
              d={country.d}
              fill={
                country.tone === 0
                  ? "rgba(19,25,39,0.98)"
                  : country.tone === 2
                    ? "rgba(16,21,34,0.98)"
                    : "rgba(14,18,31,0.96)"
              }
              stroke="rgba(0,0,0,0)"
            />
          ))}

          <path
            d={borderPath}
            fill="none"
            stroke="rgba(205,214,233,0.18)"
            strokeWidth="0.85"
          />

          {labels.map((label) => (
            <g key={label.label} transform={`translate(${label.x} ${label.y})`}>
              <circle r="2" fill="rgba(235,238,248,0.14)" />
              <text
                className="vector-map-label"
                dx="9"
                dy="4"
                fill="rgba(198,206,226,0.58)"
                fontSize="11"
                letterSpacing="0.14em"
              >
                {label.label}
              </text>
            </g>
          ))}

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

          {/* Cluster markers — visible when zoomed out */}
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
              <circle
                r={14}
                fill={cluster.color}
                opacity="0.18"
                filter="url(#map-point-glow)"
              />
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

          {soloMarkers.map((marker) => (
            <g
              key={marker.id}
              transform={`translate(${marker.x} ${marker.y})`}
              className="focus-ring cursor-pointer"
              role="button"
              tabIndex={0}
              aria-label={marker.feature.properties.title}
              onClick={() => onSelect(marker.feature)}
              onKeyDown={(event) => handleMarkerKeyDown(event, marker.feature)}
            >
              <title>
                {marker.feature.properties.locationName ||
                  marker.feature.properties.title}
              </title>

              {marker.isSelected ? (
                <circle
                  r={marker.ringRadius + 3}
                  fill={marker.color}
                  opacity="0.1"
                  filter="url(#map-point-glow)"
                />
              ) : null}

              {!reducedMotion &&
              marker.precisionVariant === "exact" &&
              marker.feature.properties.dataKind === "hotspot" ? (
                <circle
                  className="map-point-pulse"
                  r={marker.pulseRadius}
                  fill={marker.color}
                  opacity="0.16"
                />
              ) : null}

              <circle
                r={marker.haloRadius}
                fill={marker.color}
                opacity={marker.haloOpacity}
                filter="url(#map-point-glow)"
              />
              <circle
                className={`map-point--${marker.precisionVariant}`}
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
              <circle
                r={marker.interactiveRadius}
                fill="transparent"
                stroke="transparent"
              />
            </g>
          ))}
        </g>
      </svg>

      {/* Zoom controls — positioned bottom-right, outside SVG for DOM hit testing */}
      <div
        className="absolute bottom-14 right-4 z-10 flex flex-col gap-1"
        aria-label="Zoom controls"
      >
        <button
          type="button"
          className="flex h-9 w-9 items-center justify-center rounded-2xl border border-white/10 bg-black/40 text-white backdrop-blur-md transition-colors duration-150 hover:bg-white/12 active:bg-white/18 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white/60"
          aria-label="Zoom in"
          onClick={handleZoomIn}
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
            <path d="M7 2v10M2 7h10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
        </button>
        <button
          type="button"
          className="flex h-9 w-9 items-center justify-center rounded-2xl border border-white/10 bg-black/40 text-white backdrop-blur-md transition-colors duration-150 hover:bg-white/12 active:bg-white/18 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white/60"
          aria-label="Zoom out"
          onClick={handleZoomOut}
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
            <path d="M2 7h10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
        </button>
        <button
          type="button"
          className="flex h-9 w-9 items-center justify-center rounded-2xl border border-white/10 bg-black/40 text-white/70 backdrop-blur-md transition-colors duration-150 hover:bg-white/12 hover:text-white active:bg-white/18 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white/60"
          aria-label="Reset view"
          title="Reset to world view"
          onClick={handleResetView}
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
            <circle cx="7" cy="7" r="5" stroke="currentColor" strokeWidth="1.6" />
            <circle cx="7" cy="7" r="1.5" fill="currentColor" />
          </svg>
        </button>
      </div>
    </div>
  );
}
