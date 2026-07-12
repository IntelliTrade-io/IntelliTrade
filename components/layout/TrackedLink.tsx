"use client";

import Link from "next/link";
import { trackEvent } from "@/lib/analytics";
import type { ReactNode } from "react";

// A styled next/link that fires a GA4 event on click. Lets server components
// (marketing pages) attach funnel tracking to CTAs without becoming client
// components themselves. Event is dropped in dev/localhost via trackEvent.
export function TrackedLink({
  href,
  event,
  params,
  className,
  children,
  "aria-label": ariaLabel,
}: {
  href: string;
  event: string;
  params?: Record<string, string | number>;
  className?: string;
  children: ReactNode;
  "aria-label"?: string;
}) {
  return (
    <Link href={href} className={className} aria-label={ariaLabel} onClick={() => trackEvent(event, params)}>
      {children}
    </Link>
  );
}

export default TrackedLink;
