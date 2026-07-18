import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Calculator, CalendarDays, Clock, History, Sparkles, Zap } from "lucide-react";
import { jsonLd } from "@/lib/jsonLd";
import {
  getFreeCalendarRecap,
  type FreeCalendarEvent,
  type RecapEvent,
} from "@/lib/api/economicCalendar";
import ScrollRevealSection from "@/components/ui/ScrollRevealSection";
import { LatestFromBlog } from "@/components/blog/LatestFromBlog";
import { EventTime } from "./_components/EventTime";

const URL = "https://intellitrade.tech/economic-calendar";

// The layout renders per request (auth-aware nav), so this page is dynamic in
// practice; the revalidate cap is inert today but keeps the page ISR-ready if
// the tree ever becomes static.
export const revalidate = 1800;

export const metadata: Metadata = {
  title: "Economic Calendar Recap | How High-Impact Events Moved the Market | IntelliTrade",
  description:
    "Free recap of recent high-impact forex events: CPI, NFP and rate decisions from the last two weeks, each with how far the currency's major USD pair moved on release day.",
  alternates: { canonical: URL },
  openGraph: {
    title: "Economic Calendar Recap | High-Impact Events & Market Reaction | IntelliTrade",
    description:
      "Recent high-impact economic releases with the measured market reaction on release day.",
    url: URL,
    siteName: "IntelliTrade",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Economic Calendar Recap | High-Impact Events & Market Reaction | IntelliTrade",
    description: "Recent high-impact releases with the measured release-day market reaction.",
  },
};

const FAQ_ITEMS = [
  {
    question: "What does this economic calendar recap show?",
    answer:
      "It lists the high-impact economic events of the last two weeks: interest rate decisions, CPI inflation prints, employment reports such as US non-farm payrolls, GDP releases and scheduled central bank speeches. Next to each past event you see how far the event currency's major USD pair moved on the day of the release, so you can review which events actually moved the market.",
  },
  {
    question: "How is the market reaction measured?",
    answer:
      "The reaction figure is the percent change of the pair's end-of-day price on the release day compared with the previous trading day's end-of-day price. It is a daily close-to-close figure: it captures the whole release day, so when several events land on the same day they share the same daily move. It is a historical measurement, not a prediction or a trade recommendation.",
  },
  {
    question: "Which pair is used for each event?",
    answer:
      "Each event is measured on the event currency's most traded USD pair: EUR/USD for euro area events, GBP/USD for the UK, USD/JPY for Japan, and so on. US events are shown via EUR/USD, the most liquid dollar pair. The pair is always labelled next to the figure.",
  },
  {
    question: "Where is the upcoming calendar?",
    answer:
      "The forward-looking calendar is part of IntelliTrade Pro: the full schedule of upcoming events across all impact levels, with currency filters, search, live countdowns per event, source-linked event detail and grouped PMI release clusters. This free page covers what already happened; Pro covers what is next.",
  },
  {
    question: "Which timezone does this page use?",
    answer:
      "Event times are converted to your device's local timezone as soon as the page loads, with the timezone name shown next to each time. Before that conversion runs, times are shown in UTC and labelled as such. Days are grouped on the UTC calendar day, and reaction figures use end-of-day rates on that same UTC day.",
  },
];

const webPageSchema = {
  "@context": "https://schema.org",
  "@type": "WebPage",
  name: "Economic Calendar Recap | High-Impact Events & Market Reaction",
  description:
    "Recent high-impact economic releases for forex traders, each with the measured release-day move of the currency's major USD pair.",
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
    { "@type": "ListItem", position: 2, name: "Economic Calendar", item: URL },
  ],
};

function formatUtcDay(iso: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "long",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(iso));
}

function MoveBadge({ event }: { event: RecapEvent }) {
  if (event.pair === null || event.movePct === null) {
    return <span className="text-xs text-white/30">no daily figure</span>;
  }
  const up = event.movePct > 0;
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 font-mono text-[11px] tabular-nums ${
        up
          ? "border-emerald-400/25 bg-emerald-500/10 text-emerald-300/90"
          : "border-red-400/25 bg-red-500/10 text-red-300/90"
      }`}
    >
      {event.pair}
      <span>{`${up ? "+" : ""}${event.movePct.toFixed(2)}%`}</span>
    </span>
  );
}

function EventRow({ event, right }: { event: FreeCalendarEvent; right: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3">
      <div className="w-24 shrink-0 sm:w-28">
        <EventTime iso={event.dateTimeUtc} />
      </div>
      <span className="inline-flex w-12 shrink-0 items-center justify-center rounded-full border border-white/12 bg-white/[0.05] px-2 py-0.5 font-mono text-[11px] text-white/80">
        {event.currency}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-white">{event.title}</p>
        <p className="truncate text-xs text-white/40">
          {event.region}
          {event.agency ? ` · ${event.agency}` : ""}
        </p>
      </div>
      <div className="shrink-0">{right}</div>
    </div>
  );
}

const highBadge = (
  <span className="inline-flex items-center gap-1 rounded-full border border-amber-400/25 bg-amber-500/10 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-amber-300/90">
    <Zap className="h-3 w-3" />
    High
  </span>
);

export default async function Page() {
  const { todayReleased, recent } = await getFreeCalendarRecap();

  const recentByDay: Array<{ day: string; events: RecapEvent[] }> = [];
  for (const event of recent) {
    const day = formatUtcDay(event.dateTimeUtc);
    const last = recentByDay[recentByDay.length - 1];
    if (last?.day === day) last.events.push(event);
    else recentByDay.push({ day, events: [event] });
  }

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(webPageSchema) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(faqSchema) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(breadcrumbSchema) }} />

      <div className="mx-auto max-w-4xl px-4 pb-28 pt-10 sm:px-8">
        {/* ── Hero ─────────────────────────────────────────────────────────── */}
        <div className="mb-8">
          <h1 className="text-3xl font-semibold tracking-tight text-white sm:text-4xl">
            Economic Calendar Recap
          </h1>
          <p className="mt-1 text-[13px] uppercase tracking-[0.18em] text-white/40">
            High-impact events · measured market reaction
          </p>
          <p className="mt-3 max-w-xl text-sm leading-relaxed text-white/50 sm:text-base">
            The high-impact releases of the last two weeks, each with how far the currency&apos;s
            major USD pair moved on release day. Review which events actually moved the market;
            the upcoming schedule lives in Pro.
          </p>
        </div>

        {/* ── Released today ───────────────────────────────────────────────── */}
        <div className="relative overflow-hidden rounded-3xl border border-white/20 bg-clip-padding p-6 shadow-[0_32px_80px_rgba(0,0,0,0.85)] md:p-8">
          <div className="radial-backdrop" />
          <div className="relative z-10">
            <div className="mb-4 flex items-center gap-2">
              <CalendarDays className="h-4 w-4 text-brand/80" />
              <h2 className="text-lg font-semibold text-white">Released today</h2>
            </div>
            {todayReleased.length === 0 ? (
              <p className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-6 text-center text-sm text-white/45">
                No high-impact releases so far today (UTC). Today&apos;s reaction figures appear
                once the trading day closes.
              </p>
            ) : (
              <>
                <div className="space-y-2">
                  {todayReleased.map((event) => (
                    <EventRow key={event.id} event={event} right={highBadge} />
                  ))}
                </div>
                <p className="mt-3 text-xs text-white/35">
                  Reaction figures for these appear once the trading day closes.
                </p>
              </>
            )}
          </div>
        </div>

        {/* ── Recent events & reaction ─────────────────────────────────────── */}
        <div className="relative mt-8 overflow-hidden rounded-3xl border border-white/20 bg-clip-padding p-6 shadow-[0_32px_80px_rgba(0,0,0,0.85)] md:p-8">
          <div className="radial-backdrop" />
          <div className="relative z-10">
            <div className="mb-4 flex items-center gap-2">
              <History className="h-4 w-4 text-brand/80" />
              <h2 className="text-lg font-semibold text-white">Last two weeks: events and market reaction</h2>
            </div>
            {recentByDay.length === 0 ? (
              <p className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-6 text-center text-sm text-white/45">
                No high-impact releases in the last two weeks.
              </p>
            ) : (
              <div className="space-y-4">
                {recentByDay.map((group) => (
                  <div key={group.day}>
                    <div className="mb-2 flex items-center gap-2 px-1">
                      <span className="whitespace-nowrap text-[10px] font-semibold uppercase tracking-[0.2em] text-white/32">
                        {group.day}
                      </span>
                      <div className="h-px flex-1 bg-white/10" />
                    </div>
                    <div className="space-y-2">
                      {group.events.map((event) => (
                        <EventRow key={event.id} event={event} right={<MoveBadge event={event} />} />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
            <p className="mt-4 text-xs leading-relaxed text-white/35">
              Reaction = end-of-day price of the labelled pair on the release day vs the previous
              trading day, in percent. Events sharing a release day share that day&apos;s move.
              US events are shown via EUR/USD, the most liquid dollar pair. Historical
              measurement only, not a recommendation.
            </p>
          </div>
        </div>

        {/* ── Pro upsell ───────────────────────────────────────────────────── */}
        <div className="relative mt-8 overflow-hidden rounded-3xl border border-brand/25 bg-clip-padding p-6 shadow-[0_32px_80px_rgba(0,0,0,0.85)] md:p-8">
          <div className="radial-backdrop" />
          <div className="relative z-10 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-brand/90" />
                <h2 className="text-lg font-semibold text-white">The upcoming calendar lives in Pro</h2>
              </div>
              <p className="mt-2 max-w-lg text-sm leading-relaxed text-white/55">
                This page reviews what already happened. Pro shows what is next: the full
                schedule of upcoming events across all impact levels, currency filters and
                search, live countdowns per event, source-linked event detail and grouped PMI
                clusters, alongside the rest of the IntelliTrade dashboard.
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

        {/* ── How to use ───────────────────────────────────────────────────── */}
        <ScrollRevealSection className="mt-20">
          <section aria-labelledby="how-heading">
            <div className="relative overflow-hidden rounded-3xl border border-white/20 bg-clip-padding p-6 shadow-[0_32px_80px_rgba(0,0,0,0.85)] md:p-10">
              <div className="radial-backdrop" />
              <div className="relative z-10">
                <div className="inline-flex items-center rounded-full border border-brand bg-white/5 px-4 py-1 text-[11px] font-medium tracking-[0.22em] text-brand-200/90">
                  SECTION 01
                </div>
                <h2 id="how-heading" className="mt-4 text-2xl font-semibold tracking-tight text-slate-50 md:text-[26px]">
                  Why review past events?
                </h2>
                <p className="mt-4 text-[15px] leading-relaxed text-slate-200/90">
                  Not every &quot;high impact&quot; label moves the market equally. A CPI print
                  that lands on expectations can pass quietly, while a surprise rate decision can
                  move a pair a full percent in a day. Reviewing the measured reaction next to
                  each release builds a realistic sense of which events matter for the pairs you
                  follow, and how large a typical reaction actually is.
                </p>
                <p className="mt-4 text-[15px] leading-relaxed text-slate-200/90">
                  The figures here are daily close-to-close moves: they capture the whole release
                  day, including everything else that happened in it. They are a review tool for
                  context and expectation-setting, not a measurement of the event in isolation
                  and not a prediction of the next release.
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
                <div className="inline-flex items-center rounded-full border border-brand bg-white/5 px-4 py-1 text-[11px] font-medium tracking-[0.22em] text-brand-200/90">
                  SECTION 02
                </div>
                <h2 id="faq-heading" className="mt-4 text-2xl font-semibold tracking-tight text-slate-50 md:text-[26px]">
                  Economic calendar questions
                </h2>
                <div className="mt-6 space-y-3">
                  {FAQ_ITEMS.map((item) => (
                    <details key={item.question} className="group rounded-2xl border border-white/12 bg-white/[0.03] p-5">
                      <summary className="flex cursor-pointer items-center justify-between gap-4 text-[15px] font-medium text-slate-100 marker:content-['']">
                        {item.question}
                        <span className="shrink-0 text-white/40 transition-transform group-open:rotate-45">+</span>
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
              <Link href="/gold-price-today" className="group flex items-center justify-between rounded-2xl border border-white/10 bg-white/[0.03] p-5 transition-all hover:border-white/20 hover:bg-white/[0.06]">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/[0.05] text-white/70 group-hover:text-brand/80">
                    <Zap className="h-4 w-4" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-white">Prices Today</p>
                    <p className="text-xs text-white/45">Live gold, silver, oil, bitcoin.</p>
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
