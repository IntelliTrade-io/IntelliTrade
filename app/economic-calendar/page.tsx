import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Calculator, CalendarDays, Clock, Sparkles, Zap } from "lucide-react";
import { jsonLd } from "@/lib/jsonLd";
import { getFreeCalendarHighImpact, type FreeCalendarEvent } from "@/lib/api/economicCalendar";
import ScrollRevealSection from "@/components/ui/ScrollRevealSection";
import { LatestFromBlog } from "@/components/blog/LatestFromBlog";
import { EventTime } from "./_components/EventTime";

const URL = "https://intellitrade.tech/economic-calendar";

// The layout renders per request (auth-aware nav), so this page is dynamic in
// practice; the revalidate cap is inert today but keeps the page ISR-ready if
// the tree ever becomes static.
export const revalidate = 1800;

export const metadata: Metadata = {
  title: "Economic Calendar Today | High-Impact Forex Events This Week | IntelliTrade",
  description:
    "Free forex economic calendar with today's high-impact releases and the week ahead: CPI, NFP, rate decisions and central bank speeches, with times in your timezone.",
  alternates: { canonical: URL },
  openGraph: {
    title: "Economic Calendar | High-Impact Forex Events | IntelliTrade",
    description:
      "Today's high-impact economic releases and the week ahead, updated through the day.",
    url: URL,
    siteName: "IntelliTrade",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Economic Calendar | High-Impact Forex Events | IntelliTrade",
    description: "Today's high-impact economic releases and the week ahead.",
  },
};

const FAQ_ITEMS = [
  {
    question: "What is an economic calendar?",
    answer:
      "An economic calendar lists scheduled economic data releases and central bank events: inflation figures, employment reports, GDP, PMI surveys, interest rate decisions and speeches. Traders watch it because prices around these releases often move faster and spreads can widen, so knowing what is scheduled helps put market moves in context.",
  },
  {
    question: "What counts as a high-impact event?",
    answer:
      "High-impact events are the releases that most often move currency markets: interest rate decisions, US non-farm payrolls, CPI inflation prints, GDP releases and scheduled remarks by central bank chairs. This page shows only high-impact events; the full IntelliTrade calendar also covers medium and low impact releases with filters per currency.",
  },
  {
    question: "Which timezone does this calendar use?",
    answer:
      "Event times are converted to your device's local timezone as soon as the page loads, with the timezone name shown next to each time. Before that conversion runs, times are shown in UTC and labelled as such. Days are grouped on the UTC calendar day.",
  },
  {
    question: "How often is the calendar updated?",
    answer:
      "The schedule is collected continuously from official statistical agencies and central bank sources, and this page is re-rendered throughout the day. Release times can still change at short notice, so always confirm critical timings against the issuing agency shortly before the release.",
  },
  {
    question: "Where can I see medium and low impact events?",
    answer:
      "The full economic calendar inside IntelliTrade Pro covers all impact levels with currency filters, search, live countdowns per event, source-linked detail pages and grouped PMI release clusters. This free page is limited to the high-impact schedule.",
  },
];

const webPageSchema = {
  "@context": "https://schema.org",
  "@type": "WebPage",
  name: "Forex Economic Calendar | High-Impact Events",
  description:
    "Today's high-impact economic releases and the week ahead for forex traders: CPI, NFP, rate decisions and central bank speeches.",
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

function EventRow({ event }: { event: FreeCalendarEvent }) {
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
      <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-amber-400/25 bg-amber-500/10 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-amber-300/90">
        <Zap className="h-3 w-3" />
        High
      </span>
    </div>
  );
}

export default async function Page() {
  const { today, upcoming } = await getFreeCalendarHighImpact();

  const upcomingByDay: Array<{ day: string; events: FreeCalendarEvent[] }> = [];
  for (const event of upcoming) {
    const day = formatUtcDay(event.dateTimeUtc);
    const last = upcomingByDay[upcomingByDay.length - 1];
    if (last?.day === day) last.events.push(event);
    else upcomingByDay.push({ day, events: [event] });
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
            Economic Calendar
          </h1>
          <p className="mt-1 text-[13px] uppercase tracking-[0.18em] text-white/40">
            Today&apos;s high-impact forex events · week ahead
          </p>
          <p className="mt-3 max-w-xl text-sm leading-relaxed text-white/50 sm:text-base">
            The releases most likely to move currency markets: rate decisions, inflation prints,
            employment reports and central bank speeches. Times switch to your timezone
            automatically; days follow the UTC calendar.
          </p>
        </div>

        {/* ── Today ─────────────────────────────────────────────────────────── */}
        <div className="relative overflow-hidden rounded-3xl border border-white/20 bg-clip-padding p-6 shadow-[0_32px_80px_rgba(0,0,0,0.85)] md:p-8">
          <div className="radial-backdrop" />
          <div className="relative z-10">
            <div className="mb-4 flex items-center gap-2">
              <CalendarDays className="h-4 w-4 text-brand/80" />
              <h2 className="text-lg font-semibold text-white">Today&apos;s high-impact events</h2>
            </div>
            {today.length === 0 ? (
              <p className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-6 text-center text-sm text-white/45">
                No high-impact releases are scheduled for today (UTC). Markets are typically
                quietest on weekends and public holidays; see the week ahead below.
              </p>
            ) : (
              <div className="space-y-2">
                {today.map((event) => (
                  <EventRow key={event.id} event={event} />
                ))}
              </div>
            )}
          </div>
        </div>

        {/* ── Week ahead ───────────────────────────────────────────────────── */}
        <div className="relative mt-8 overflow-hidden rounded-3xl border border-white/20 bg-clip-padding p-6 shadow-[0_32px_80px_rgba(0,0,0,0.85)] md:p-8">
          <div className="radial-backdrop" />
          <div className="relative z-10">
            <div className="mb-4 flex items-center gap-2">
              <Clock className="h-4 w-4 text-brand/80" />
              <h2 className="text-lg font-semibold text-white">Coming up this week</h2>
            </div>
            {upcomingByDay.length === 0 ? (
              <p className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-6 text-center text-sm text-white/45">
                No further high-impact releases in the next seven days.
              </p>
            ) : (
              <div className="space-y-4">
                {upcomingByDay.map((group) => (
                  <div key={group.day}>
                    <div className="mb-2 flex items-center gap-2 px-1">
                      <span className="whitespace-nowrap text-[10px] font-semibold uppercase tracking-[0.2em] text-white/32">
                        {group.day}
                      </span>
                      <div className="h-px flex-1 bg-white/10" />
                    </div>
                    <div className="space-y-2">
                      {group.events.map((event) => (
                        <EventRow key={event.id} event={event} />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
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
                <h2 className="text-lg font-semibold text-white">The full calendar lives in Pro</h2>
              </div>
              <p className="mt-2 max-w-lg text-sm leading-relaxed text-white/55">
                Medium and low impact releases, currency filters and search, live countdowns per
                event, source-linked event detail and grouped PMI clusters, alongside the rest of
                the IntelliTrade dashboard.
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
                  How to read an economic calendar
                </h2>
                <p className="mt-4 text-[15px] leading-relaxed text-slate-200/90">
                  Each row is a scheduled release: the time it goes out, the currency it concerns
                  most directly, and the publishing agency. High-impact events are the ones with a
                  track record of moving markets: interest rate decisions, inflation (CPI),
                  employment reports such as US non-farm payrolls, GDP and scheduled central bank
                  speeches.
                </p>
                <p className="mt-4 text-[15px] leading-relaxed text-slate-200/90">
                  Around a major release, spreads often widen and prices can gap in either
                  direction. Many traders use the calendar defensively: knowing a release is
                  minutes away explains sudden volatility and helps avoid being surprised by it.
                  The calendar tells you when the market may move; it says nothing about
                  direction.
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
