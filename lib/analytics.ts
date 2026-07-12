"use client";

// Typed GA4 event helper (conversion funnel). One entry point for all custom
// events so triggers stay consistent and dev/localhost never pollutes GA4.
//
// Guard: events are dropped unless we're a production build served from the real
// domain. Pageviews stay in lib/gtag.ts; this module is events only.

type EventParams = Record<string, string | number>;

/** True only in a production build running on a non-local host with gtag loaded. */
function analyticsEnabled(): boolean {
  if (process.env.NODE_ENV !== "production") return false;
  if (typeof window === "undefined" || typeof window.gtag !== "function") return false;
  const host = window.location.hostname;
  if (host === "localhost" || host === "127.0.0.1") return false;
  return true;
}

/** Send a GA4 event. No-op in dev, on localhost, or before gtag loads. */
export function trackEvent(name: string, params?: EventParams): void {
  if (!analyticsEnabled()) return;
  window.gtag("event", name, params ?? {});
}
