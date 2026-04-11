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
    .sort((left, right) => {
      if (left.isSelected && !right.isSelected) {
        return 1;
      }

      if (!left.isSelected && right.isSelected) {
        return -1;
      }

      return left.radius - right.radius;
    });
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

function severityColor(severityScore: number) {
  if (severityScore >= 67) {
    return "#ff8dac";
  }

  if (severityScore >= 34) {
    return "#ffd676";
  }

  return "#8cf0c8";
}
