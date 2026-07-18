import type { Metadata } from "next";
import { jsonLd } from "@/lib/jsonLd";
import Link from "next/link";
import { Calculator, Gauge, Scale, ArrowRight } from "lucide-react";
import CompoundingCalculator from "@/components/calculators/CompoundingCalculator";
import ScrollRevealSection from "@/components/ui/ScrollRevealSection";
import { LatestFromBlog } from "@/components/blog/LatestFromBlog";

const URL = "https://intellitrade.tech/compoundingcalculator";

export const metadata: Metadata = {
  title: "Compounding Calculator | Trading Account Growth Over Time | IntelliTrade",
  description:
    "See how a trading account compounds at a fixed return per day, week or month, with an optional periodic deposit. Free compounding growth calculator with a full period-by-period table.",
  alternates: { canonical: URL },
  openGraph: {
    title: "Compounding Calculator | IntelliTrade",
    description:
      "Project account growth at a fixed return per period, with an optional deposit and a full period-by-period table.",
    url: URL,
    siteName: "IntelliTrade",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Compounding Calculator | IntelliTrade",
    description: "Project trading account growth over time, period by period.",
  },
};

const FAQ_ITEMS = [
  {
    question: "What is a compounding calculator?",
    answer:
      "A compounding calculator projects how a balance grows when each period's return is applied on top of the previous period's ending balance, rather than just the original amount. For traders it answers a common question: if I grow my account by a fixed percentage each day, week or month, what does the balance look like over time? It also shows the full period-by-period table so you can see how the curve steepens.",
  },
  {
    question: "How does compounding work in trading?",
    answer:
      "Compounding means reinvesting gains so that future returns are earned on a larger base. If you start with 1,000 and gain 2% in a period, you have 1,020; the next 2% is earned on 1,020, not 1,000. Over many periods this produces exponential rather than linear growth. The same mechanism works in reverse: consecutive losses compound downward, which is why protecting the downside matters as much as growing the upside.",
  },
  {
    question: "Is a fixed percentage per week realistic?",
    answer:
      "A constant return every period is a planning assumption, not a forecast. Real trading returns are uneven: winning and losing streaks, variable position sizes, and changing market conditions all break the smooth curve. Use this calculator to understand the mechanics and set expectations, not as a promise of results. Consistent small edges compounded over time are powerful, but no strategy delivers the same percentage every single period.",
  },
  {
    question: "What does the periodic deposit option do?",
    answer:
      "The optional deposit is an amount added at the end of each period, after that period's growth is applied. It models topping up the account regularly (for example, adding to your balance each month). Contributions are counted separately from growth, so the results show how much of the final balance came from deposits versus compounded returns.",
  },
  {
    question: "What is the difference between simple and compound growth?",
    answer:
      "Simple growth applies the return only to the original balance every period, producing a straight line. Compound growth applies the return to the current balance, which includes previous gains, producing a curve that accelerates over time. This calculator models compound growth. The longer the horizon and the higher the per-period return, the larger the gap between the two.",
  },
];

const softwareAppSchema = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "IntelliTrade Compounding Calculator",
  applicationCategory: "FinanceApplication",
  operatingSystem: "Web",
  offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
  description:
    "Free compounding growth calculator for traders. Projects account growth at a fixed return per period with an optional periodic deposit, including a full period-by-period table.",
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
    { "@type": "ListItem", position: 2, name: "Compounding Calculator", item: URL },
  ],
};

const EXAMPLES = [
  {
    title: "1,000 at 2% / week",
    lead: "52 weeks",
    body: "Starting at 1,000 and compounding 2% each week for a year ends near 2,800 — the balance roughly doubles from reinvested gains alone, no deposits.",
  },
  {
    title: "5,000 at 1% / day",
    lead: "20 trading days",
    body: "A 1% daily edge over one trading month (about 20 days) grows 5,000 to roughly 6,100. Small per-period edges add up quickly when compounded.",
  },
  {
    title: "1,000 + 200 / month",
    lead: "3% / month, 24 months",
    body: "Compounding 3% monthly while adding 200 each month shows how growth and contributions stack: the results split how much came from returns versus deposits.",
  },
];

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
            Compounding Calculator
          </h1>
          <p className="mt-1 text-[13px] uppercase tracking-[0.18em] text-white/40">
            Trading account growth over time
          </p>
          <p className="mt-3 max-w-xl text-sm leading-relaxed text-white/50 sm:text-base">
            See how an account compounds at a fixed return per day, week or month, with an optional
            periodic deposit and a full period-by-period growth table.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            {["Daily / weekly / monthly", "Optional deposits", "Full growth table", "Free tool"].map((label) => (
              <span key={label} className="inline-flex items-center rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-[11px] text-white/50">
                {label}
              </span>
            ))}
          </div>
        </div>

        {/* ── Calculator card ───────────────────────────────────────────────── */}
        <div className="relative overflow-hidden rounded-3xl border border-white/20 bg-clip-padding p-6 shadow-[0_32px_80px_rgba(0,0,0,0.85)] md:p-10">
          <div className="radial-backdrop" />
          <div className="relative z-10">
            <CompoundingCalculator />
          </div>
        </div>

        <p className="mt-4 text-center text-[11px] text-white/28">
          For educational and planning purposes only. A fixed return every period is an assumption,
          not a forecast; real trading results vary.
        </p>

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
                  How compounding works
                </h2>
                <p className="mt-4 text-[15px] leading-relaxed text-slate-200/90">
                  Each period&apos;s return is applied to the previous period&apos;s ending balance,
                  so gains earn gains. That is what turns a steady per-period edge into an
                  accelerating curve rather than a straight line.
                </p>
                <div className="mt-6 rounded-2xl border border-white/12 bg-white/[0.03] p-5 font-mono text-[13px] leading-relaxed text-white/70">
                  end of period = start x (1 + rate) + deposit
                  <br />
                  next period starts from that ending balance
                </div>
                <p className="mt-4 text-[15px] leading-relaxed text-slate-200/90">
                  The same mechanism compounds losses downward, which is why a disciplined pre-trade
                  routine — sizing, event risk and zone quality — matters: one oversized loss can
                  erase many periods of careful growth.
                </p>
              </div>
            </div>
          </section>
        </ScrollRevealSection>

        {/* ── Worked examples ──────────────────────────────────────────────── */}
        <ScrollRevealSection className="mt-8">
          <section aria-labelledby="examples-heading">
            <div className="relative overflow-hidden rounded-3xl border border-white/20 bg-clip-padding p-6 shadow-[0_32px_80px_rgba(0,0,0,0.85)] md:p-10">
              <div className="radial-backdrop" />
              <div className="relative z-10">
                <div className="inline-flex items-center rounded-full border border-brand bg-white/5 px-4 py-1 text-[11px] font-medium tracking-[0.22em] text-brand-200/90">
                  SECTION 02
                </div>
                <h2 id="examples-heading" className="mt-4 text-2xl font-semibold tracking-tight text-slate-50 md:text-[26px]">
                  Worked examples
                </h2>
                <div className="mt-8 grid gap-4 sm:grid-cols-3">
                  {EXAMPLES.map(({ title, lead, body }) => (
                    <div key={title} className="rounded-2xl border border-white/15 bg-white/5 p-5 backdrop-blur-xl">
                      <p className="text-sm font-semibold text-white">{title}</p>
                      <p className="mt-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-brand-300/90">{lead}</p>
                      <p className="mt-3 text-[13px] leading-relaxed text-white/55">{body}</p>
                    </div>
                  ))}
                </div>
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
                  SECTION 03
                </div>
                <h2 id="faq-heading" className="mt-4 text-2xl font-semibold tracking-tight text-slate-50 md:text-[26px]">
                  Compounding questions
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
              <Link href="/margincalculator" className="group flex items-center justify-between rounded-2xl border border-white/10 bg-white/[0.03] p-5 transition-all hover:border-white/20 hover:bg-white/[0.06]">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/[0.05] text-white/70 group-hover:text-brand/80">
                    <Scale className="h-4 w-4" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-white">Margin</p>
                    <p className="text-xs text-white/45">Margin for a leveraged position.</p>
                  </div>
                </div>
                <ArrowRight className="h-4 w-4 text-white/30 group-hover:translate-x-0.5 group-hover:text-white/60 transition-all" />
              </Link>
            </div>
          </section>
        </ScrollRevealSection>

        <LatestFromBlog />
      </div>
    </>
  );
}
