"use client";

import { useState } from "react";
import { ZoneOverlayPreview } from "./ZoneOverlayPreview";
import { supportResistanceMockZones, supportResistanceOverlaySeries } from "./mockData";

// Lightweight branded SSZ visual for marketing sections (homepage, /pro).
// Uses the concept overlay (mock zones + line) with local selection state — no
// API, no protected data, no win-rate figures.
export function ZoneOverlayShowcase({ compact = false }: { compact?: boolean }) {
  const [selectedZoneId, setSelectedZoneId] = useState<string | null>(
    supportResistanceMockZones[0]?.id ?? null,
  );

  return (
    <ZoneOverlayPreview
      points={supportResistanceOverlaySeries}
      zones={supportResistanceMockZones}
      selectedZoneId={selectedZoneId}
      onSelectZone={setSelectedZoneId}
      compact={compact}
    />
  );
}

export default ZoneOverlayShowcase;
