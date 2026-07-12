"use client";

import { useEffect, useRef } from "react";
import { trackEvent } from "@/lib/analytics";

// Fires view_pricing once when a pricing section mounts. Rendered (invisibly)
// inside the pricing block on /pro and /upgrade.
export function PricingBeacon({ page }: { page: string }) {
  const fired = useRef(false);
  useEffect(() => {
    if (fired.current) return;
    fired.current = true;
    trackEvent("view_pricing", { page });
  }, [page]);
  return null;
}

export default PricingBeacon;
