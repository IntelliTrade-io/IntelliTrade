"use client";

import { useEffect, useRef } from "react";
import { trackEvent } from "@/lib/analytics";

// Fires the GA4 `purchase` event once when the success page mounts. This is the
// client-side conversion signal; a sessionStorage flag prevents a page refresh
// from double-counting. (Server-side confirmation via the Stripe webhook is the
// authoritative record and a separate phase-2 item.)
export function PurchaseBeacon() {
  const fired = useRef(false);
  useEffect(() => {
    if (fired.current) return;
    fired.current = true;
    try {
      if (sessionStorage.getItem("it_purchase_tracked") === "1") return;
      sessionStorage.setItem("it_purchase_tracked", "1");
    } catch {
      // sessionStorage unavailable (private mode) — still fire once per mount.
    }
    trackEvent("purchase", { currency: "EUR", value: 15 });
  }, []);
  return null;
}

export default PurchaseBeacon;
