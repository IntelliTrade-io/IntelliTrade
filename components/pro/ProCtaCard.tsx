"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { trackEvent } from "@/lib/analytics";

// Reusable contextual CTA card that points visitors at IntelliTrade Pro from
// high-intent free surfaces (calculator result, price pages). Fires cta_click
// with a cta_id + src so conversions can be attributed to their entry point.
export function ProCtaCard({
  heading,
  body,
  ctaLabel = "Explore Pro",
  href,
  ctaId,
  src,
  className = "",
}: {
  heading: string;
  body: string;
  ctaLabel?: string;
  href: string;
  ctaId: string;
  src: string;
  className?: string;
}) {
  return (
    <div
      className={`relative overflow-hidden rounded-[24px] border border-violet-500/20 bg-violet-500/[0.05] p-6 ${className}`}
    >
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_85%_10%,rgba(139,92,246,0.14),transparent_55%)]" />
      <div className="relative z-10 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-base font-semibold text-white">{heading}</p>
          <p className="mt-1 text-sm text-white/55">{body}</p>
        </div>
        <Link
          href={href}
          onClick={() => trackEvent("cta_click", { cta_id: ctaId, destination: "/pro", src })}
          className="inline-flex shrink-0 items-center gap-2 rounded-full bg-violet-600 px-5 py-2.5 text-sm font-semibold text-white shadow-[0_0_28px_rgba(139,92,246,0.32)] transition-all hover:bg-violet-500"
        >
          {ctaLabel}
          <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
    </div>
  );
}

export default ProCtaCard;
