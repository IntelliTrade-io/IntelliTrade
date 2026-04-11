"use client";

import { VectorWorldMap } from "@/components/Map/VectorWorldMap";
import type { ConflictFeature, ConflictFeatureCollection } from "@/lib/schema";

type MapViewProps = {
  data: ConflictFeatureCollection;
  densityEnabled: boolean;
  onSelect: (feature: ConflictFeature) => void;
  reducedMotion: boolean;
  selectedFeatureId: string | null;
};

export function MapView(props: MapViewProps) {
  return <VectorWorldMap {...props} />;
}
