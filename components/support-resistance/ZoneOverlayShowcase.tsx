"use client";

import { useState } from "react";
import { ZoneOverlayPreview } from "./ZoneOverlayPreview";
import { supportResistanceMockZones } from "./mockData";

// Lightweight branded S&R Alpha preview for marketing sections (homepage, /pro).
// Uses the illustrative candlestick chart with sample graded zones and local
// selection state. No API, no protected data.
export function ZoneOverlayShowcase({ compact = false }: { compact?: boolean }) {
  const [selectedZoneId, setSelectedZoneId] = useState<string | null>(
    supportResistanceMockZones[0]?.id ?? null,
  );

  return (
    <ZoneOverlayPreview
      zones={supportResistanceMockZones}
      selectedZoneId={selectedZoneId}
      onSelectZone={setSelectedZoneId}
      compact={compact}
    />
  );
}

export default ZoneOverlayShowcase;
