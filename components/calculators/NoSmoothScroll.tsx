"use client";

import { useEffect } from "react";

/**
 * Forces `scroll-behavior: auto` while mounted, overriding the global
 * `scroll-smooth` on <html>. The calculator page has no intentional in-page
 * smooth-scroll navigation, and the global smooth behavior turns any incidental
 * browser scroll adjustment (focus retention, layout shift when panels expand)
 * into a jarring animated jump. Restores the previous value on unmount so other
 * routes keep their smooth anchor scrolling. Renders nothing.
 */
export default function NoSmoothScroll() {
  useEffect(() => {
    const root = document.documentElement;
    const previous = root.style.scrollBehavior;
    root.style.scrollBehavior = "auto";
    return () => {
      root.style.scrollBehavior = previous;
    };
  }, []);
  return null;
}
