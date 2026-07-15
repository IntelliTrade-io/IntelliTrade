"use client";

import { useState } from "react";
import { ZoneOverlayPreview } from "./ZoneOverlayPreview";
import { supportResistanceMockZones, supportResistanceOverlaySeries } from "./mockData";

// Lightweight branded S&R Alpha preview for marketing sections (homepage, /pro).
// Uses the illustrative overlay (sample zones + line) with local selection
// state — no API, no protected data.
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
