import type { GeoProjection } from "d3-geo";

import type { ConflictFeature } from "@/lib/schema";
import { clamp } from "@/lib/utils";

export type ProjectedConflictMarker = {
  color: string;
  coreOpacity: number;
  densityOpacity: number;
  densityRadius: number;
  feature: ConflictFeature;
  haloOpacity: number;
  haloRadius: number;
  id: string;
  interactiveRadius: number;
  isSelected: boolean;
  precisionVariant: "country" | "exact";
  pulseRadius: number;
  radius: number;
  ringRadius: number;
  strokeWidth: number;
  x: number;
  y: number;
};

export type ClusterMarker = {
  id: string;
  x: number;
  y: number;
  count: number;
  maxScore: number;
  color: string;
  features: ConflictFeature[];
};

export function projectConflictMarkers(
  features: ConflictFeature[],
  projection: GeoProjection,
  selectedFeatureId: string | null
) {
  return features
    .flatMap((feature) => {
      const projected = projection(feature.geometry.coordinates as [number, number]);

      if (!projected) {
        return [];
      }

      const isSelected = String(feature.id) === selectedFeatureId;
      const visual = getMarkerVisual(feature, isSelected);

      return [
        {
          ...visual,
          feature,
          id: String(feature.id),
          isSelected,
          x: projected[0],
          y: projected[1]
        }
      ];
    })
    // Sort: Low → Medium → High → selected (highest severity renders on top)
    .sort((left, right) => {
      if (left.isSelected && !right.isSelected) return 1;
      if (!left.isSelected && right.isSelected) return -1;
      return left.feature.properties.severityScore - right.feature.properties.severityScore;
    });
}

/**
 * Grid-based clustering in projection (SVG) space.
 * Groups markers within gridSize pixels of each other into cluster markers.
 * Returns separate soloMarkers and clusters arrays.
 */
export function clusterSvgMarkers(
  markers: ProjectedConflictMarker[],
  gridSize: number
): { soloMarkers: ProjectedConflictMarker[]; clusters: ClusterMarker[] } {
  const cells = new Map<string, ProjectedConflictMarker[]>();

  for (const marker of markers) {
    const cellX = Math.floor(marker.x / gridSize);
    const cellY = Math.floor(marker.y / gridSize);
    const key = `${cellX}_${cellY}`;
    const existing = cells.get(key);
    if (existing) {
      existing.push(marker);
    } else {
      cells.set(key, [marker]);
    }
  }

  const soloMarkers: ProjectedConflictMarker[] = [];
  const clusters: ClusterMarker[] = [];

  for (const [, group] of cells) {
    if (group.length === 1) {
      soloMarkers.push(group[0]);
      continue;
    }

    // Centroid of the group
    const cx = group.reduce((sum, m) => sum + m.x, 0) / group.length;
    const cy = group.reduce((sum, m) => sum + m.y, 0) / group.length;
    const maxScore = Math.max(...group.map((m) => m.feature.properties.severityScore));

    clusters.push({
      id: `cluster-${Math.round(cx)}-${Math.round(cy)}`,
      x: cx,
      y: cy,
      count: group.length,
      maxScore,
      color: severityColor(maxScore),
      features: group.map((m) => m.feature)
    });
  }

  return { soloMarkers, clusters };
}

export function getMarkerVisual(
  feature: ConflictFeature,
  isSelected: boolean
): Omit<ProjectedConflictMarker, "feature" | "id" | "isSelected" | "x" | "y"> {
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
    strokeWidth: isSelected ? 1.9 : isCountryLevel ? 1 : 1.3
  };
}

function getHotspotRadius(hotspotCount: number) {
  if (hotspotCount >= 50) {
    return 8.6;
  }

  if (hotspotCount >= 20) {
    return 7.3;
  }

  if (hotspotCount >= 5) {
    return 5.9;
  }

  return 4.8;
}

export function severityColor(severityScore: number) {
  if (severityScore >= 67) {
    return "#ff8dac";
  }

  if (severityScore >= 34) {
    return "#ffd676";
  }

  return "#8cf0c8";
}
