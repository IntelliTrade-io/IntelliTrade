import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, ArrowRight, ChevronRight, Radar, Sparkles } from "lucide-react";
import { jsonLd } from "@/lib/jsonLd";
import { getStrengthTeaser } from "@/lib/api/currencyStrengthTeaser";
import {
  STRENGTH_PAIR_SYMBOLS,
  buildPairStrengthView,
  relatedStrengthPairs,
  strengthPairFromSlug,
  strengthPairToSlug,
  type PairTrend,
} from "@/lib/strength-pairs";
import { currencyName, PER_PAIR_SYMBOLS } from "@/lib/pair-meta";
import { StrengthBarList } from "@/components/strength/StrengthBarList";
import ScrollRevealSection from "@/components/ui/ScrollRevealSection";
import { LatestFromBlog } from "@/components/blog/LatestFromBlog";

const BASE = "https://intellitrade.tech";

// The layout renders per request (auth-aware nav), so this page is dynamic in
// practice; the revalidate cap is inert today but keeps the page ISR-ready if
// the tree ever becomes static.
export const revalidate = 1800;

// Only the 28 standard pairs exist; any other slug 404s instead of being
// generated on demand (keeps the URL space closed and the canonical set tidy).
export const dynamicParams = false;

export function generateStaticParams(): { pair: string }[] {
  return STRENGTH_PAIR_SYMBOLS.map((symbol) => ({ pair: strengthPairToSlug(symbol) }));
}

// ─── Metadata ───────────────────────────────────────────────────────────────

export async function generateMetadata({
  params,
}: {
  params: Promise<{ pair: string }>;
}): Promise<Metadata> {
  const { pair: slug } = await params;
  const symbol = strengthPairFromSlug(slug);
  if (!symbol) return { title: "Pair Not Found · IntelliTrade" };

  const base = symbol.slice(0, 3);
  const quote = symbol.slice(3);
  const display = `${base}/${quote}`;
  const url = `${BASE}/currency-strength/${slug}`;
  const title = `${display} Currency Strength | ${currencyName(base)} vs ${currencyName(quote)} | IntelliTrade`;
  const description = `Free ${display} currency strength reading: yesterday's scores for the ${currencyName(base)} and the ${currencyName(quote)}, their strength differential, one-day change, and the scanner's daily and 4-hour trend detail.`;

  return {
    title,
    description,
    // Self-canonical: each per-pair page targets its own long-tail query
    // ("eurusd strength today") and complements the hub page.
    alternates: { canonical: url },
    openGraph: {
      title: `${display} Currency Strength`,
      description,
      url,
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title: `${display} Currency Strength`,
      description,
    },
  };
}

// ─── Presentation helpers ───────────────────────────────────────────────────

function formatUtcDate(iso: string): string {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(iso));
}

function formatUtcDateTime(iso: string): string {
  const d = new Date(iso);
  const day = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(d);
  const time = new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone: "UTC",
  }).format(d);
  return `${day}, ${time} UTC`;
}

function formatUtcDay(iso: string): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(iso));
}

function TrendChip({ trend }: { trend: PairTrend | null }) {
  if (!trend) return <span className="text-sm text-white/30">no read</span>;
  const styles =
    trend === "bullish"
      ? "border-teal-400/25 bg-teal-500/10 text-teal-300/90"
      : trend === "bearish"
        ? "border-orange-400/25 bg-orange-500/10 text-orange-300/90"
        : "border-white/15 bg-white/[0.05] text-white/60";
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-medium capitalize ${styles}`}>
      {trend}
    </span>
  );
}

// ─── Page ───────────────────────────────────────────────────────────────────

export default async function PairStrengthPage({
  params,
}: {
  params: Promise<{ pair: string }>;
}) {
  const { pair: slug } = await params;
  const symbol = strengthPairFromSlug(slug);
  if (!symbol) notFound();

  const url = `${BASE}/currency-strength/${slug}`;
  const data = await getStrengthTeaser();
  const view = data ? buildPairStrengthView(symbol, data.readings, data.pairs) : null;

  const base = symbol.slice(0, 3);
  const quote = symbol.slice(3);
  const display = `${base}/${quote}`;
  const baseName = currencyName(base);
  const quoteName = currencyName(quote);

  const showDelta =
    view !== null &&
    data?.previousAtUtc != null &&
    (view.baseReading.delta !== null || view.quoteReading.delta !== null);

  const siblings = relatedStrengthPairs(symbol);
  const hasCalcPages = PER_PAIR_SYMBOLS.includes(symbol);
  const calcSlug = symbol.toLowerCase();

  const webPageSchema = {
    "@context": "https://schema.org",
    "@type": "WebPage",
    name: `${display} Currency Strength | Yesterday's Daily Reading`,
    description: `Yesterday's currency strength scores for ${baseName} and ${quoteName}, with their strength differential and the scanner's trend detail for ${display}.`,
    url,
  };

  const breadcrumbSchema = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: `${BASE}/` },
      { "@type": "ListItem", position: 2, name: "Currency Strength", item: `${BASE}/currency-strength` },
      { "@type": "ListItem", position: 3, name: display, item: url },
    ],
  };

  const faqs = [
    {
      q: `What does the ${display} currency strength reading show?`,
      a: `It shows how the ${baseName} (${base}) and the ${quoteName} (${quote}) each scored in yesterday's daily strength reading, on a -100 to +100 scale. Each score aggregates that currency's trend behaviour across all 28 pair combinations of the eight majors, not just ${display} itself, so you can see which side of the pair carried the recent pressure.`,
    },
    {
      q: `What is the ${display} strength differential?`,
      a: `The differential is the ${base} score minus the ${quote} score. A large positive differential means the ${baseName} read broadly stronger than the ${quoteName} in yesterday's reading; a large negative one means the reverse; values near zero mean the two currencies read similarly. It is a summary of measured trend behaviour, not a forecast for ${display}.`,
    },
    {
      q: `What do the daily and 4-hour trend reads for ${display} mean?`,
      a: `Alongside the per-currency scores, the scanner records the trend direction it measured on the ${display} daily and 4-hour charts, a combined read when both agree, a multi-timeframe confidence figure, and the price level of the last break of structure it detected on each timeframe. These describe the state of the ${display} chart at the exact time of the reading, which is shown on the page. Because this free page carries yesterday's reading, several 4-hour candles have closed since: the daily read usually still applies the next day, but the live 4-hour state can already differ from the chip shown here.`,
    },
    {
      q: `How current is this ${display} data, and is it a signal?`,
      a: `This free page shows yesterday's final daily reading and updates once per day, so everything on it, including the 4-hour detail, is a snapshot from the reading time shown, not the current chart. The live meter updated through the trading day is part of IntelliTrade Pro. Nothing here is a trade signal or recommendation: strength readings measure what already happened in the market and are meant as context for your own ${display} analysis.`,
    },
  ];

  const faqSchema = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.map((f) => ({
      "@type": "Question",
      name: f.q,
      acceptedAnswer: { "@type": "Answer", text: f.a },
    })),
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(webPageSchema) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(faqSchema) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(breadcrumbSchema) }} />

      <div className="mx-auto max-w-4xl px-4 pb-28 pt-10 sm:px-8">
        {/* ── Breadcrumb ───────────────────────────────────────────────────── */}
        <nav aria-label="Breadcrumb" className="mb-6 text-[12px] text-white/40">
          <ol className="flex flex-wrap items-center gap-1.5">
            <li>
              <Link href="/currency-strength" className="inline-flex items-center gap-1 transition hover:text-white/70">
                <ArrowLeft className="h-3 w-3" />
                Currency Strength
              </Link>
            </li>
            <li aria-hidden className="text-white/25">/</li>
            <li className="text-white/60">{display}</li>
          </ol>
        </nav>

        {/* ── Hero ─────────────────────────────────────────────────────────── */}
        <div className="mb-8">
          <h1 className="text-3xl font-semibold tracking-tight text-white sm:text-4xl">
            {display} Currency Strength
          </h1>
          <p className="mt-1 text-[13px] uppercase tracking-[0.18em] text-white/40">
            {baseName} vs {quoteName} · yesterday&apos;s daily reading
          </p>
          <p className="mt-3 max-w-xl text-sm leading-relaxed text-white/50 sm:text-base">
            Which side of {display} was doing the work: yesterday&apos;s strength scores for the{" "}
            {baseName} and the {quoteName}, measured across all 28 major pair combinations, plus
            the scanner&apos;s trend detail for the pair itself.
          </p>
        </div>

        {/* ── Reading ──────────────────────────────────────────────────────── */}
        <div className="relative overflow-hidden rounded-3xl border border-white/20 bg-clip-padding p-6 shadow-[0_32px_80px_rgba(0,0,0,0.85)] md:p-8">
          <div className="radial-backdrop" />
          <div className="relative z-10">
            <div className="mb-1 flex items-center gap-2">
              <Radar className="h-4 w-4 text-brand/80" />
              <h2 className="text-lg font-semibold text-white">
                {data && view ? `Reading for ${formatUtcDate(data.snapshotAtUtc)}` : "Daily reading"}
              </h2>
            </div>

            {!view ? (
              <p className="mt-4 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-6 text-center text-sm text-white/45">
                Yesterday&apos;s reading is not available right now. Check back shortly.
              </p>
            ) : (
              <>
                <p className="mb-5 text-xs text-slate-400">
                  Scale -100 (weakest) to +100 (strongest). Rank is the currency&apos;s place among
                  the eight majors in this reading.
                </p>

                <StrengthBarList
                  readings={[view.baseReading, view.quoteReading]}
                  showDelta={showDelta}
                  showRank
                />

                <p className="mt-5 text-sm leading-relaxed text-white/55">
                  Strength differential:{" "}
                  <span className="font-mono text-slate-200">
                    {view.differential > 0 ? "+" : ""}
                    {view.differential.toFixed(1)}
                  </span>{" "}
                  points{" "}
                  {view.differential === 0
                    ? `(the two currencies read level)`
                    : `toward the ${view.differential > 0 ? baseName : quoteName}`}
                  . The {baseName} ranked #{view.baseReading.rank} and the {quoteName} #
                  {view.quoteReading.rank} of the eight majors.
                </p>

                <p className="mt-4 text-xs leading-relaxed text-white/35">
                  Delayed data: this page updates once per day with the prior day&apos;s final
                  reading. Historical measurement of trend behaviour, not a recommendation.
                </p>
              </>
            )}
          </div>
        </div>

        {/* ── Scanner detail ───────────────────────────────────────────────── */}
        {view?.detail && (
          <div className="relative mt-8 overflow-hidden rounded-3xl border border-white/20 bg-clip-padding p-6 shadow-[0_32px_80px_rgba(0,0,0,0.85)] md:p-8">
            <div className="radial-backdrop" />
            <div className="relative z-10">
              <h2 className="text-lg font-semibold text-white">
                Scanner detail for {display}
              </h2>
              <p className="mt-1 mb-5 text-xs text-slate-400">
                State of the {display} chart <span className="text-slate-300">at the time of this reading
                {data ? ` (${formatUtcDateTime(data.snapshotAtUtc)})` : ""}</span>, not your live chart.
                Candles have closed since; the fast timeframes below can differ from what you see now.
              </p>

              <dl className="grid gap-4 sm:grid-cols-2">
                <div className="rounded-2xl border border-white/15 bg-white/5 p-5">
                  <dt className="text-[11px] font-semibold uppercase tracking-[0.25em] text-brand-300/90">
                    Trend read
                  </dt>
                  <dd className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-slate-200">
                    <span className="inline-flex items-center gap-2">
                      <span className="text-xs text-white/45">Daily</span>
                      <TrendChip trend={view.detail.d1} />
                    </span>
                    <span className="inline-flex items-center gap-2">
                      <span className="text-xs text-white/45">4-hour</span>
                      <TrendChip trend={view.detail.h4} />
                    </span>
                    <span className="inline-flex items-center gap-2">
                      <span className="text-xs text-white/45">Combined</span>
                      <TrendChip trend={view.detail.combined} />
                    </span>
                    <span className="block w-full text-xs text-white/45">
                      Measured at the reading time. The daily read typically holds for a day; the
                      4-hour read is several closed bars old by now and may have flipped since.
                    </span>
                  </dd>
                </div>

                <div className="rounded-2xl border border-white/15 bg-white/5 p-5">
                  <dt className="text-[11px] font-semibold uppercase tracking-[0.25em] text-brand-300/90">
                    Multi-timeframe confidence
                  </dt>
                  <dd className="mt-3 text-sm text-slate-200">
                    {view.detail.confidence === null ? (
                      <span className="text-white/30">no figure</span>
                    ) : (
                      <>
                        <span className="font-mono text-lg text-white">{view.detail.confidence}</span>
                        <span className="text-white/45"> / 100</span>
                        <span className="block mt-1 text-xs text-white/45">
                          How strongly the daily and 4-hour reads agreed at the reading time.
                        </span>
                      </>
                    )}
                  </dd>
                </div>

                <div className="rounded-2xl border border-white/15 bg-white/5 p-5">
                  <dt className="text-[11px] font-semibold uppercase tracking-[0.25em] text-brand-300/90">
                    Last break of structure · Daily
                  </dt>
                  <dd className="mt-3 text-sm text-slate-200">
                    {view.detail.bosD1 ? (
                      <>
                        <span className="font-mono text-white">{view.detail.bosD1.level}</span>
                        <span className="block mt-1 text-xs text-white/45">
                          {formatUtcDay(view.detail.bosD1.timeUtc)}
                        </span>
                      </>
                    ) : (
                      <span className="text-white/30">none detected</span>
                    )}
                  </dd>
                </div>

                <div className="rounded-2xl border border-white/15 bg-white/5 p-5">
                  <dt className="text-[11px] font-semibold uppercase tracking-[0.25em] text-brand-300/90">
                    Last break of structure · 4-hour
                  </dt>
                  <dd className="mt-3 text-sm text-slate-200">
                    {view.detail.bosH4 ? (
                      <>
                        <span className="font-mono text-white">{view.detail.bosH4.level}</span>
                        <span className="block mt-1 text-xs text-white/45">
                          {formatUtcDay(view.detail.bosH4.timeUtc)}
                        </span>
                      </>
                    ) : (
                      <span className="text-white/30">none detected</span>
                    )}
                  </dd>
                </div>
              </dl>

              <p className="mt-4 text-xs leading-relaxed text-white/35">
                A break of structure is the most recent price level where the scanner measured the
                {" "}{display} trend breaking a prior swing point, as of the reading time; newer
                breaks may have happened since. Chart-state description from yesterday&apos;s
                reading, not a level recommendation. The current chart state updates through the
                day in Pro.
              </p>
            </div>
          </div>
        )}

        {/* ── Pro upsell ───────────────────────────────────────────────────── */}
        <div className="relative mt-8 overflow-hidden rounded-3xl border border-brand/25 bg-clip-padding p-6 shadow-[0_32px_80px_rgba(0,0,0,0.85)] md:p-8">
          <div className="radial-backdrop" />
          <div className="relative z-10 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-brand/90" />
                <h2 className="text-lg font-semibold text-white">The live meter lives in Pro</h2>
              </div>
              <p className="mt-2 max-w-lg text-sm leading-relaxed text-white/55">
                This page shows yesterday. Pro shows now: the daily meter updated through the
                trading day, a separate intraday reading on a 15-minute cadence, data-freshness
                indicators, strength history, and the rest of the IntelliTrade dashboard.
              </p>
            </div>
            <Link
              href="/pro"
              className="inline-flex shrink-0 items-center justify-center gap-2 rounded-full bg-gradient-to-r from-brand to-brandLight px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-brand/35 transition-all hover:opacity-90"
            >
              Explore Pro
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>

        {/* ── FAQ ──────────────────────────────────────────────────────────── */}
        <ScrollRevealSection className="mt-20">
          <section aria-labelledby="faq-heading">
            <div className="relative overflow-hidden rounded-3xl border border-white/20 bg-clip-padding p-6 shadow-[0_32px_80px_rgba(0,0,0,0.85)] md:p-10">
              <div className="radial-backdrop" />
              <div className="relative z-10">
                <h2 id="faq-heading" className="text-2xl font-semibold tracking-tight text-slate-50 md:text-[26px]">
                  {display} strength questions
                </h2>
                <div className="mt-6 space-y-3">
                  {faqs.map((item) => (
                    <details key={item.q} className="group rounded-2xl border border-white/12 bg-white/[0.03] p-5">
                      <summary className="flex cursor-pointer items-center justify-between gap-4 text-[15px] font-medium text-slate-100 marker:content-['']">
                        {item.q}
                        <ChevronRight
                          aria-hidden
                          className="h-5 w-5 shrink-0 text-slate-300 transition-transform duration-300 group-open:rotate-90"
                        />
                      </summary>
                      <p className="mt-3 text-[14px] leading-relaxed text-white/60">{item.a}</p>
                    </details>
                  ))}
                </div>
              </div>
            </div>
          </section>
        </ScrollRevealSection>

        {/* ── Other pairs + tools ──────────────────────────────────────────── */}
        <ScrollRevealSection className="mt-8">
          <section aria-labelledby="related-heading">
            <div className="relative overflow-hidden rounded-3xl border border-white/20 bg-clip-padding p-6 shadow-[0_32px_80px_rgba(0,0,0,0.85)] md:p-10">
              <div className="radial-backdrop" />
              <div className="relative z-10">
                <h2 id="related-heading" className="text-2xl font-semibold tracking-tight text-slate-50 md:text-[26px]">
                  Strength for related pairs
                </h2>
                <div className="mt-6 flex flex-wrap gap-2">
                  {siblings.map((s) => (
                    <Link
                      key={s}
                      href={`/currency-strength/${strengthPairToSlug(s)}`}
                      className="inline-flex items-center rounded-full border border-white/15 bg-white/5 px-4 py-2 font-mono text-[13px] text-slate-200/90 transition hover:border-white/25 hover:bg-white/[0.08] hover:text-white"
                    >
                      {s.slice(0, 3)}/{s.slice(3)}
                    </Link>
                  ))}
                  <Link
                    href="/currency-strength"
                    className="inline-flex items-center gap-1.5 rounded-full border border-brand/30 bg-brand/10 px-4 py-2 text-[13px] text-brand-200/90 transition hover:border-brand/50 hover:text-white"
                  >
                    All eight majors
                    <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                </div>

                <div className="mt-8 grid gap-4 sm:grid-cols-3">
                  <Link
                    href={hasCalcPages ? `/lotsizecalculator/${calcSlug}` : "/lotsizecalculator"}
                    className="group rounded-2xl border border-white/15 bg-white/5 p-5 transition hover:border-white/20 hover:bg-white/[0.07]"
                  >
                    <p className="text-[11px] font-semibold uppercase tracking-[0.25em] text-brand-300/90">Tool</p>
                    <p className="mt-2 text-[15px] font-medium text-slate-100 group-hover:text-white">
                      {hasCalcPages ? `${display} lot size calculator` : "Lot size calculator"}
                    </p>
                    <p className="mt-1 text-[13px] text-slate-400/80">
                      Size a {display} position from your risk.
                    </p>
                  </Link>
                  <Link
                    href={hasCalcPages ? `/pipvaluecalculator/${calcSlug}` : "/pipvaluecalculator"}
                    className="group rounded-2xl border border-white/15 bg-white/5 p-5 transition hover:border-white/20 hover:bg-white/[0.07]"
                  >
                    <p className="text-[11px] font-semibold uppercase tracking-[0.25em] text-brand-300/90">Tool</p>
                    <p className="mt-2 text-[15px] font-medium text-slate-100 group-hover:text-white">
                      {hasCalcPages ? `${display} pip value calculator` : "Pip value calculator"}
                    </p>
                    <p className="mt-1 text-[13px] text-slate-400/80">
                      What one pip of {display} is worth.
                    </p>
                  </Link>
                  <Link
                    href="/economic-calendar"
                    className="group rounded-2xl border border-white/15 bg-white/5 p-5 transition hover:border-white/20 hover:bg-white/[0.07]"
                  >
                    <p className="text-[11px] font-semibold uppercase tracking-[0.25em] text-brand-300/90">Free</p>
                    <p className="mt-2 text-[15px] font-medium text-slate-100 group-hover:text-white">
                      Economic calendar recap
                    </p>
                    <p className="mt-1 text-[13px] text-slate-400/80">
                      How recent events moved the market.
                    </p>
                  </Link>
                </div>
              </div>
            </div>
          </section>
        </ScrollRevealSection>

        <LatestFromBlog />
      </div>
    </>
  );
}
