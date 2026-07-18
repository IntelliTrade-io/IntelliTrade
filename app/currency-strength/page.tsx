import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Calculator, CalendarDays, ChevronRight, Clock, Radar, Sparkles } from "lucide-react";
import { jsonLd } from "@/lib/jsonLd";
import { getStrengthTeaser } from "@/lib/api/currencyStrengthTeaser";
import { summariseExtremes, type TeaserReading } from "@/lib/strength-teaser";
import ScrollRevealSection from "@/components/ui/ScrollRevealSection";
import { LatestFromBlog } from "@/components/blog/LatestFromBlog";

const URL = "https://intellitrade.tech/currency-strength";

// The layout renders per request (auth-aware nav), so this page is dynamic in
// practice; the revalidate cap is inert today but keeps the page ISR-ready if
// the tree ever becomes static.
export const revalidate = 1800;

export const metadata: Metadata = {
  title: "Currency Strength Meter | Yesterday's Reading for the 8 Majors | IntelliTrade",
  description:
    "Free daily currency strength reading for USD, EUR, GBP, JPY, AUD, NZD, CAD and CHF: yesterday's final scores on a -100 to +100 scale, ranked strongest to weakest, with the one-day change.",
  alternates: { canonical: URL },
  openGraph: {
    title: "Currency Strength Meter | Yesterday's Daily Reading | IntelliTrade",
    description:
      "Yesterday's final currency strength scores for the eight major currencies, ranked strongest to weakest.",
    url: URL,
    siteName: "IntelliTrade",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Currency Strength Meter | Yesterday's Daily Reading | IntelliTrade",
    description:
      "Yesterday's final currency strength scores for the eight major currencies, ranked strongest to weakest.",
  },
};

const FAQ_ITEMS = [
  {
    question: "What is a currency strength meter?",
    answer:
      "A currency strength meter scores each currency on its own instead of quoting pairs. Every pair price mixes two currencies: EUR/USD falling can mean euro weakness, dollar strength, or both. The meter separates them by aggregating how each currency behaves across all 28 pair combinations of the eight majors, so you can see at a glance which side of a pair is doing the work.",
  },
  {
    question: "How is the score computed?",
    answer:
      "The IntelliTrade scanner evaluates trend direction for all 28 pairs formed by USD, EUR, GBP, JPY, AUD, NZD, CAD and CHF on daily and 4-hour charts, weights each pair by its trend confidence, and nets the result per currency onto a -100 to +100 scale. +100 means the currency was strong against everything it trades against in that reading; -100 means weak across the board; scores near zero mean no clear one-sided pressure.",
  },
  {
    question: "How current is the data on this page?",
    answer:
      "This free page shows yesterday's final daily reading and is refreshed once per day. The date of the reading is always shown above the meter. The live meter in IntelliTrade Pro updates through the trading day and adds an intraday reading on a 15-minute cadence, with data-freshness indicators.",
  },
  {
    question: "What does the one-day change column show?",
    answer:
      "It compares each currency's score with the previous trading day's final reading, so you can see which currencies gained or lost strength into the close. When no usable previous reading exists, for example after a long market holiday, the column is omitted rather than showing a misleading figure.",
  },
  {
    question: "Is this a buy or sell signal?",
    answer:
      "No. The meter is a measurement of recent trend behaviour, not a recommendation. Strength readings describe what already happened in the market; they do not predict what happens next, and IntelliTrade does not provide trade signals. Traders typically use strength context alongside their own analysis and risk management.",
  },
];

const webPageSchema = {
  "@context": "https://schema.org",
  "@type": "WebPage",
  name: "Currency Strength Meter | Yesterday's Daily Reading",
  description:
    "Free daily currency strength reading for the eight major currencies, scored -100 to +100 and ranked strongest to weakest.",
  url: URL,
};

const faqSchema = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: FAQ_ITEMS.map((item) => ({
    "@type": "Question",
    name: item.question,
    acceptedAnswer: { "@type": "Answer", text: item.answer },
  })),
};

const breadcrumbSchema = {
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  itemListElement: [
    { "@type": "ListItem", position: 1, name: "Home", item: "https://intellitrade.tech/" },
    { "@type": "ListItem", position: 2, name: "Currency Strength", item: URL },
  ],
};

// Diverging poles validated for the dark surface (same pair as the blog
// StrengthSnapshot): teal = stronger, orange = weaker. Polarity is never
// color-alone — bars extend left/right of the zero line and every row
// carries a signed value.
const POSITIVE = "#0d9488";
const NEGATIVE = "#ea580c";

function formatUtcDate(iso: string): string {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(iso));
}

function ReadingRow({ reading, showDelta }: { reading: TeaserReading; showDelta: boolean }) {
  const { code, score, delta } = reading;
  const halfWidth = Math.abs(score) / 2; // % of the full track
  const positive = score >= 0;
  return (
    <div className="flex items-center gap-3 text-sm">
      <span className="w-10 shrink-0 font-mono text-slate-300">{code}</span>
      <div className="relative h-3 flex-1 overflow-hidden rounded-full bg-white/[0.06]">
        <span className="absolute inset-y-0 left-1/2 w-px bg-white/20" aria-hidden />
        <span
          className="absolute inset-y-[2px] rounded-[4px]"
          style={{
            backgroundColor: positive ? POSITIVE : NEGATIVE,
            left: positive ? "50%" : `${50 - halfWidth}%`,
            width: `${halfWidth}%`,
          }}
          aria-hidden
        />
      </div>
      <span className="w-14 shrink-0 text-right font-mono text-xs text-slate-200">
        {score > 0 ? "+" : ""}
        {score.toFixed(1)}
      </span>
      {showDelta && (
        <span className="w-14 shrink-0 text-right font-mono text-[11px] text-white/40">
          {delta === null ? "·" : `${delta > 0 ? "+" : ""}${delta.toFixed(1)}`}
        </span>
      )}
    </div>
  );
}

export default async function Page() {
  const data = await getStrengthTeaser();
  const readings = data?.readings ?? [];
  const showDelta = data?.previousAtUtc !== null && readings.some((r) => r.delta !== null);
  const { strongest, weakest } = summariseExtremes(readings);

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(webPageSchema) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(faqSchema) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(breadcrumbSchema) }} />

      <div className="mx-auto max-w-4xl px-4 pb-28 pt-10 sm:px-8">
        {/* ── Hero ─────────────────────────────────────────────────────────── */}
        <div className="mb-8">
          <h1 className="text-3xl font-semibold tracking-tight text-white sm:text-4xl">
            Currency Strength Meter
          </h1>
          <p className="mt-1 text-[13px] uppercase tracking-[0.18em] text-white/40">
            Yesterday&apos;s daily reading · 8 major currencies
          </p>
          <p className="mt-3 max-w-xl text-sm leading-relaxed text-white/50 sm:text-base">
            Which currencies were strong and which were weak, measured across all 28 major pair
            combinations and scored from -100 to +100. This free page shows yesterday&apos;s final
            reading; the live and intraday meter is part of Pro.
          </p>
        </div>

        {/* ── Reading ──────────────────────────────────────────────────────── */}
        <div className="relative overflow-hidden rounded-3xl border border-white/20 bg-clip-padding p-6 shadow-[0_32px_80px_rgba(0,0,0,0.85)] md:p-8">
          <div className="radial-backdrop" />
          <div className="relative z-10">
            <div className="mb-1 flex items-center gap-2">
              <Radar className="h-4 w-4 text-brand/80" />
              <h2 className="text-lg font-semibold text-white">
                {data ? `Reading for ${formatUtcDate(data.snapshotAtUtc)}` : "Daily reading"}
              </h2>
            </div>

            {readings.length === 0 ? (
              <p className="mt-4 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-6 text-center text-sm text-white/45">
                Yesterday&apos;s reading is not available right now. Check back shortly.
              </p>
            ) : (
              <>
                <p className="mb-5 text-xs text-slate-400">
                  Daily weighted scores, ranked strongest to weakest. Scale -100 (weakest) to +100
                  (strongest).
                </p>

                <div className="mb-2 flex items-center gap-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-white/32">
                  <span className="w-10 shrink-0">Ccy</span>
                  <span className="flex-1" />
                  <span className="w-14 shrink-0 text-right">Score</span>
                  {showDelta && <span className="w-14 shrink-0 text-right">1d change</span>}
                </div>
                <div className="space-y-2">
                  {readings.map((reading) => (
                    <ReadingRow key={reading.code} reading={reading} showDelta={showDelta} />
                  ))}
                </div>

                {(strongest.length > 0 || weakest.length > 0) && (
                  <p className="mt-5 text-sm text-white/55">
                    {strongest.length > 0 && (
                      <>
                        Strongest: <span className="font-mono text-slate-200">{strongest.join(", ")}</span>
                        {weakest.length > 0 && " · "}
                      </>
                    )}
                    {weakest.length > 0 && (
                      <>
                        Weakest: <span className="font-mono text-slate-200">{weakest.join(", ")}</span>
                      </>
                    )}
                  </p>
                )}

                <p className="mt-4 text-xs leading-relaxed text-white/35">
                  {showDelta && data?.previousAtUtc
                    ? `1d change compares with the previous trading day's final reading (${formatUtcDate(data.previousAtUtc)}). `
                    : ""}
                  Delayed data: this page updates once per day with the prior day&apos;s final
                  reading. Historical measurement of trend behaviour, not a recommendation.
                </p>
              </>
            )}
          </div>
        </div>

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

        {/* ── How to read it ───────────────────────────────────────────────── */}
        <ScrollRevealSection className="mt-20">
          <section aria-labelledby="how-heading">
            <div className="relative overflow-hidden rounded-3xl border border-white/20 bg-clip-padding p-6 shadow-[0_32px_80px_rgba(0,0,0,0.85)] md:p-10">
              <div className="radial-backdrop" />
              <div className="relative z-10">
                <h2 id="how-heading" className="text-2xl font-semibold tracking-tight text-slate-50 md:text-[26px]">
                  How to read a strength score
                </h2>
                <p className="mt-4 text-[15px] leading-relaxed text-slate-200/90">
                  Every pair price mixes two currencies, so a chart alone cannot tell you which
                  side is moving it. The meter separates the two: each currency is scored by how
                  it behaved across all 28 pair combinations of the eight majors on daily and
                  4-hour charts, weighted by trend confidence. A currency near +100 was gaining
                  against nearly everything; one near -100 was losing across the board; scores
                  inside roughly ±15 read as neutral.
                </p>
                <p className="mt-4 text-[15px] leading-relaxed text-slate-200/90">
                  The most common way traders use this context: when one currency reads clearly
                  strong and another clearly weak, the pair between them is where recent
                  one-sided pressure has been concentrated, which makes it a natural candidate
                  for further chart analysis. The reading describes what the market already did.
                  It is context for your own analysis, not a prediction and not a signal.
                </p>
              </div>
            </div>
          </section>
        </ScrollRevealSection>

        {/* ── FAQ ──────────────────────────────────────────────────────────── */}
        <ScrollRevealSection className="mt-8">
          <section aria-labelledby="faq-heading">
            <div className="relative overflow-hidden rounded-3xl border border-white/20 bg-clip-padding p-6 shadow-[0_32px_80px_rgba(0,0,0,0.85)] md:p-10">
              <div className="radial-backdrop" />
              <div className="relative z-10">
                <h2 id="faq-heading" className="text-2xl font-semibold tracking-tight text-slate-50 md:text-[26px]">
                  Currency strength questions
                </h2>
                <div className="mt-6 space-y-3">
                  {FAQ_ITEMS.map((item) => (
                    <details key={item.question} className="group rounded-2xl border border-white/12 bg-white/[0.03] p-5">
                      <summary className="flex cursor-pointer items-center justify-between gap-4 text-[15px] font-medium text-slate-100 marker:content-['']">
                        {item.question}
                        <ChevronRight
                          aria-hidden
                          className="h-5 w-5 shrink-0 text-slate-300 transition-transform duration-300 group-open:rotate-90"
                        />
                      </summary>
                      <p className="mt-3 text-[14px] leading-relaxed text-white/60">{item.answer}</p>
                    </details>
                  ))}
                </div>
              </div>
            </div>
          </section>
        </ScrollRevealSection>

        {/* ── Related tools (internal linking) ─────────────────────────────── */}
        <ScrollRevealSection className="mt-8">
          <section aria-labelledby="related-heading">
            <h2 id="related-heading" className="mb-4 text-sm font-semibold uppercase tracking-[0.18em] text-white/40">
              Related free tools
            </h2>
            <div className="grid gap-3 sm:grid-cols-3">
              <Link href="/economic-calendar" className="group flex items-center justify-between rounded-2xl border border-white/10 bg-white/[0.03] p-5 transition-all hover:border-white/20 hover:bg-white/[0.06]">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/[0.05] text-white/70 group-hover:text-brand/80">
                    <CalendarDays className="h-4 w-4" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-white">Calendar Recap</p>
                    <p className="text-xs text-white/45">How events moved the market.</p>
                  </div>
                </div>
                <ArrowRight className="h-4 w-4 text-white/30 transition-all group-hover:translate-x-0.5 group-hover:text-white/60" />
              </Link>
              <Link href="/forex-market-hours" className="group flex items-center justify-between rounded-2xl border border-white/10 bg-white/[0.03] p-5 transition-all hover:border-white/20 hover:bg-white/[0.06]">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/[0.05] text-white/70 group-hover:text-brand/80">
                    <Clock className="h-4 w-4" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-white">Market Hours</p>
                    <p className="text-xs text-white/45">Which session is open now.</p>
                  </div>
                </div>
                <ArrowRight className="h-4 w-4 text-white/30 transition-all group-hover:translate-x-0.5 group-hover:text-white/60" />
              </Link>
              <Link href="/lotsizecalculator" className="group flex items-center justify-between rounded-2xl border border-white/10 bg-white/[0.03] p-5 transition-all hover:border-white/20 hover:bg-white/[0.06]">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/[0.05] text-white/70 group-hover:text-brand/80">
                    <Calculator className="h-4 w-4" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-white">Lot Size</p>
                    <p className="text-xs text-white/45">Size a position from your risk.</p>
                  </div>
                </div>
                <ArrowRight className="h-4 w-4 text-white/30 transition-all group-hover:translate-x-0.5 group-hover:text-white/60" />
              </Link>
            </div>
          </section>
        </ScrollRevealSection>

        <LatestFromBlog />
      </div>
    </>
  );
}
