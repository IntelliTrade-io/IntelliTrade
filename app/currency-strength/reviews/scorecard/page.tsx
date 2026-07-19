import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { jsonLd } from "@/lib/jsonLd";
import { getScorecard, isCsmReviewsEnabled } from "@/lib/api/csmReviews";
import { OVERLAP_DISCLOSURE, SCORECARD_LIMITATION } from "@/lib/strength-reviews-copy";

const BASE = "https://intellitrade.tech";
const URL = `${BASE}/currency-strength/reviews/scorecard`;

export const revalidate = 3600;

export const metadata: Metadata = {
  title: "Currency Strength Review Scorecard | IntelliTrade",
  description:
    "Aggregate outcomes across all completed currency-strength reviews: Continued, Mixed and Reversed rates, mean and median follow-through, and coverage, over the production observation window.",
  alternates: { canonical: URL },
  openGraph: { title: "Currency Strength Review Scorecard", description: "Aggregate outcomes across completed reviews.", url: URL, type: "website" },
};

function fmtDate(iso: string | null): string {
  if (!iso) return "n/a";
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(new Date(iso));
}

function num(v: unknown, suffix = ""): string {
  if (v === null || v === undefined) return "n/a";
  return `${v}${suffix}`;
}

function pct(v: unknown): string {
  if (typeof v !== "number") return "n/a";
  return `${(v * 100).toFixed(1)}%`;
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/12 bg-white/[0.04] p-4">
      <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-white/40">{label}</p>
      <p className="mt-2 font-mono text-xl tabular-nums text-white">{value}</p>
    </div>
  );
}

export default async function ScorecardPage() {
  if (!isCsmReviewsEnabled()) notFound();
  const card = await getScorecard();

  const webPageSchema = {
    "@context": "https://schema.org",
    "@type": "WebPage",
    name: "Currency Strength Review Scorecard",
    description: "Aggregate outcomes across all completed currency-strength reviews.",
    url: URL,
  };

  const s = (card?.stats ?? {}) as Record<string, unknown>;

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(webPageSchema) }} />

      <div className="mx-auto max-w-3xl px-4 pb-28 pt-10 sm:px-8">
        <nav aria-label="Breadcrumb" className="mb-6 text-[12px] text-white/40">
          <ol className="flex flex-wrap items-center gap-1.5">
            <li>
              <Link href="/currency-strength/reviews" className="inline-flex items-center gap-1 transition hover:text-white/70">
                <ArrowLeft className="h-3 w-3" />
                Historical Reviews
              </Link>
            </li>
            <li aria-hidden className="text-white/25">/</li>
            <li className="text-white/60">Scorecard</li>
          </ol>
        </nav>

        <h1 className="text-3xl font-semibold tracking-tight text-white sm:text-4xl">Scorecard</h1>
        <p className="mt-3 text-sm leading-relaxed text-white/50">
          {card
            ? `Production observation window: ${fmtDate(card.observationStart)} to ${fmtDate(card.observationEnd)}. Methodology ${card.methodologyVersion}. Last updated ${fmtDate(card.lastUpdated)}.`
            : "The scorecard fills once completed reviews exist."}
        </p>

        {!card || (s.count ?? 0) === 0 ? (
          <p className="mt-8 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-10 text-center text-sm text-white/45">
            No completed reviews yet. The scorecard populates as cases complete.
          </p>
        ) : (
          <>
            <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-3">
              <Stat label="Completed cases" value={num(s.count)} />
              <Stat label="Continued" value={`${num(s.continued)} (${pct(s.continued_rate)})`} />
              <Stat label="Mixed" value={`${num(s.mixed)} (${pct(s.mixed_rate)})`} />
              <Stat label="Reversed" value={`${num(s.reversed)} (${pct(s.reversed_rate)})`} />
              <Stat label="Mean 30-bar" value={num(s.mean_short_return_pct, "%")} />
              <Stat label="Median 30-bar" value={num(s.median_short_return_pct, "%")} />
              <Stat label="Mean 60-bar" value={num(s.mean_long_return_pct, "%")} />
              <Stat label="Median 60-bar" value={num(s.median_long_return_pct, "%")} />
              <Stat label="Mean max continuation" value={num(s.mean_max_continuation_pct, "%")} />
              <Stat label="Mean largest pullback" value={num(s.mean_max_pullback_pct, "%")} />
              <Stat label="Incomplete cases" value={num(s.incomplete_count)} />
              <Stat label="Correlated observations" value={num(s.overlap_disclosed_count)} />
            </div>
            <p className="mt-6 text-xs leading-relaxed text-white/40">{OVERLAP_DISCLOSURE}</p>
            <p className="mt-2 text-xs leading-relaxed text-white/40">{SCORECARD_LIMITATION}</p>
          </>
        )}
      </div>
    </>
  );
}
