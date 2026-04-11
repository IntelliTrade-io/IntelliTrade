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
import { projectConflictMarkers } from "@/components/Map/hotspots";
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
  // Density mode intentionally simplifies as visible point counts grow so SVG glow
  // rendering stays responsive without changing the overall look of the map.
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
        transformRef.current = event.transform;
        viewportNode.setAttribute(
          "transform",
          `translate(${event.transform.x} ${event.transform.y}) scale(${event.transform.k})`
        );
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
          <linearGradient id="map-ocean" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="rgba(9,12,20,0.98)" />
            <stop offset="100%" stopColor="rgba(4,7,14,0.88)" />
          </linearGradient>
        </defs>

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
            ? markers.map((marker) => (
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

          {markers.map((marker) => (
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
    </div>
  );
}
