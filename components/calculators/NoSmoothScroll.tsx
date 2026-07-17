"use client";

import { useEffect } from "react";

/**
 * Pins the page scroll position while the calculator is mounted.
 *
 * Two browser behaviors combine into "click anything → page jumps to top or
 * bottom" on this page:
 *
 * 1. Scroll anchoring: whenever DOM is inserted/removed (result cards on
 *    invalidate, Manage panel, stop-mode fields), the browser re-anchors the
 *    viewport to keep some node stable. The sections below the calculator sit
 *    inside `opacity: 0` / transformed reveal wrappers, which are invalid
 *    anchor candidates, so the re-anchor resolves to a wrong node and the
 *    viewport teleports. `overflow-anchor: none` on the scroller disables the
 *    machinery: DOM changes then never move the scroll position at all.
 * 2. Global `scroll-smooth` on <html> turns any residual adjustment into an
 *    animated jump; forced back to `auto` here.
 *
 * Applied to both <html> and <body> (Chrome reads the viewport's
 * overflow-anchor from either depending on which propagates the scroll).
 * Restores previous inline values on unmount. Renders nothing.
 */
export default function NoSmoothScroll() {
  useEffect(() => {
    const root = document.documentElement;
    const body = document.body;
    const prev = {
      behavior: root.style.scrollBehavior,
      rootAnchor: root.style.overflowAnchor,
      bodyAnchor: body.style.overflowAnchor,
    };
    root.style.scrollBehavior = "auto";
    root.style.overflowAnchor = "none";
    body.style.overflowAnchor = "none";
    return () => {
      root.style.scrollBehavior = prev.behavior;
      root.style.overflowAnchor = prev.rootAnchor;
      body.style.overflowAnchor = prev.bodyAnchor;
    };
  }, []);
  return null;
}
