import type { Metadata } from "next";
import { jsonLd } from "@/lib/jsonLd";
import Link from "next/link";
import { Calculator, Gauge, TrendingUp, ArrowRight } from "lucide-react";
import MarketHoursClock from "@/components/tools/MarketHoursClock";
import ScrollRevealSection from "@/components/ui/ScrollRevealSection";

const URL = "https://intellitrade.tech/forex-market-hours";

export const metadata: Metadata = {
  title: "Forex Market Hours | Is the Market Open Now? Session Clock | IntelliTrade",
  description:
    "Live forex market hours and session clock. See whether the Sydney, Tokyo, London and New York sessions are open right now, with time until the next open or close. DST-aware.",
  alternates: { canonical: URL },
  openGraph: {
    title: "Forex Market Hours & Session Clock | IntelliTrade",
    description:
      "Is the forex market open right now? Live Sydney, Tokyo, London and New York session status, DST-aware.",
    url: URL,
    siteName: "IntelliTrade",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Forex Market Hours & Session Clock | IntelliTrade",
    description: "Live forex session status, DST-aware.",
  },
};

const FAQ_ITEMS = [
  {
    question: "Is the forex market open right now?",
    answer:
      "The clock above shows the live answer. The forex market trades 24 hours a day, five days a week, opening with the Sydney session on Monday morning (local time) and closing after the New York session on Friday evening. It is closed over the weekend. The status updates in real time and adjusts automatically for daylight saving time in each region.",
  },
  {
    question: "What are the four major forex trading sessions?",
    answer:
      "The market follows the sun through four major financial centres: Sydney, Tokyo, London and New York. Sydney opens the week, Tokyo covers the Asian session, London anchors the European session, and New York covers the Americas. As one session closes another is often already open, which is what gives forex its continuous 24-hour weekday coverage.",
  },
  {
    question: "When do the London and New York sessions overlap?",
    answer:
      "The London and New York sessions overlap for a few hours in the London afternoon / New York morning. This overlap is the busiest window of the trading day because the two largest centres are active at once, which typically means higher liquidity and tighter spreads on major pairs. The clock shows both as open during the overlap.",
  },
  {
    question: "Why do the session times shift during the year?",
    answer:
      "Session hours are defined in each centre's local time, and most of these regions observe daylight saving time on different dates. When London moves between GMT and BST, or New York between EST and EDT, the session's time in UTC shifts by an hour. This clock evaluates each session in its own timezone, so it always reflects the correct local hours rather than a fixed offset.",
  },
  {
    question: "Does the forex market close for holidays?",
    answer:
      "The weekly open and close shown here follow the standard Monday-to-Friday schedule and do not account for national or bank holidays, when liquidity can thin out or specific centres effectively pause even though the broader market remains technically open. Treat the clock as the regular weekly schedule and check for major holidays separately.",
  },
];

const softwareAppSchema = {
  "@context": "https://schema.org",
  "@type": "WebApplication",
  name: "IntelliTrade Forex Market Hours Clock",
  applicationCategory: "FinanceApplication",
  operatingSystem: "Web",
  offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
  description:
    "Live forex market hours and session clock for the Sydney, Tokyo, London and New York sessions, with real-time open/closed status and DST-aware local times.",
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
    { "@type": "ListItem", position: 2, name: "Forex Market Hours", item: URL },
  ],
};

export default function Page() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(softwareAppSchema) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(faqSchema) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(breadcrumbSchema) }} />

      <div className="mx-auto max-w-4xl px-4 pb-28 pt-10 sm:px-8">

        {/* ── Hero ─────────────────────────────────────────────────────────── */}
        <div className="mb-8">
          <h1 className="text-3xl font-semibold tracking-tight text-white sm:text-4xl">
            Forex Market Hours
          </h1>
          <p className="mt-1 text-[13px] uppercase tracking-[0.18em] text-white/40">
            Live session clock · is the market open now?
          </p>
          <p className="mt-3 max-w-xl text-sm leading-relaxed text-white/50 sm:text-base">
            See whether the Sydney, Tokyo, London and New York sessions are open right now, with the
            time until each one&apos;s next open or close. Local times adjust automatically for
            daylight saving.
          </p>
        </div>

        {/* ── Clock ─────────────────────────────────────────────────────────── */}
        <div className="relative overflow-hidden rounded-3xl border border-white/20 bg-clip-padding p-6 shadow-[0_32px_80px_rgba(0,0,0,0.85)] md:p-8">
          <div className="radial-backdrop" />
          <div className="relative z-10">
            <MarketHoursClock />
          </div>
        </div>

        {/* ── How it works ─────────────────────────────────────────────────── */}
        <ScrollRevealSection className="mt-20">
          <section aria-labelledby="how-heading">
            <div className="relative overflow-hidden rounded-3xl border border-white/20 bg-clip-padding p-6 shadow-[0_32px_80px_rgba(0,0,0,0.85)] md:p-10">
              <div className="radial-backdrop" />
              <div className="relative z-10">
                <div className="inline-flex items-center rounded-full border border-brand bg-white/5 px-4 py-1 text-[11px] font-medium tracking-[0.22em] text-brand-200/90">
                  SECTION 01
                </div>
                <h2 id="how-heading" className="mt-4 text-2xl font-semibold tracking-tight text-slate-50 md:text-[26px]">
                  How forex market hours work
                </h2>
                <p className="mt-4 text-[15px] leading-relaxed text-slate-200/90">
                  Forex trades around the clock on weekdays because it follows the business hours of
                  the world&apos;s major financial centres. As Sydney winds down, Tokyo is active; as
                  Tokyo closes, London opens; and London&apos;s afternoon overlaps New York&apos;s
                  morning. That relay is what keeps the market open 24 hours a day, Monday to Friday.
                </p>
                <p className="mt-4 text-[15px] leading-relaxed text-slate-200/90">
                  Liquidity is not even across the day. The London / New York overlap is typically the
                  most active window, while the gap between the New York close and the Sydney open is
                  the quietest. Knowing which session is live helps set expectations for spreads and
                  volatility, before you consider a trade.
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
                  Forex market hours questions
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
                <ArrowRight className="h-4 w-4 text-white/30 group-hover:translate-x-0.5 group-hover:text-white/60 transition-all" />
              </Link>
              <Link href="/pipvaluecalculator" className="group flex items-center justify-between rounded-2xl border border-white/10 bg-white/[0.03] p-5 transition-all hover:border-white/20 hover:bg-white/[0.06]">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/[0.05] text-white/70 group-hover:text-brand/80">
                    <Gauge className="h-4 w-4" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-white">Pip Value</p>
                    <p className="text-xs text-white/45">Value of one pip, your currency.</p>
                  </div>
                </div>
                <ArrowRight className="h-4 w-4 text-white/30 group-hover:translate-x-0.5 group-hover:text-white/60 transition-all" />
              </Link>
              <Link href="/gold-price-today" className="group flex items-center justify-between rounded-2xl border border-white/10 bg-white/[0.03] p-5 transition-all hover:border-white/20 hover:bg-white/[0.06]">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/[0.05] text-white/70 group-hover:text-brand/80">
                    <TrendingUp className="h-4 w-4" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-white">Prices Today</p>
                    <p className="text-xs text-white/45">Live gold, silver, oil, bitcoin.</p>
                  </div>
                </div>
                <ArrowRight className="h-4 w-4 text-white/30 group-hover:translate-x-0.5 group-hover:text-white/60 transition-all" />
              </Link>
            </div>
          </section>
        </ScrollRevealSection>
      </div>
    </>
  );
}
