"use client";

import { useRef } from "react";
import { SupportResistanceAlphaModule } from "./SupportResistanceAlphaModule";
import { trackEvent } from "@/lib/analytics";

// Public, logged-out preview of Smart Support Zones for /smart-support-zones.
// Renders the real module against its self-contained mock data (mockData.ts) —
// no API call, no protected data. profiles={[]} hides the research-profile
// section so historical win-rate figures never reach a public page.
export function SmartSupportZonesPreview() {
  const fired = useRef(false);

  // Fire once when the visitor first interacts with the preview (selecting a
  // zone, panning, etc.). One signal per session is enough for the funnel.
  const handleFirstInteraction = () => {
    if (fired.current) return;
    fired.current = true;
    trackEvent("preview_interact", { tool: "ssz" });
  };

  return (
    <div onPointerDown={handleFirstInteraction}>
      <SupportResistanceAlphaModule profiles={[]} />
    </div>
  );
}

export default SmartSupportZonesPreview;
