import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { BookOpen, ArrowRight, ArrowLeft } from "lucide-react";
import { jsonLd } from "@/lib/jsonLd";
import LotSizeCalculator from "@/components/calculators/LotSizeCalculator";
import NoSmoothScroll from "@/components/calculators/NoSmoothScroll";
import ScrollRevealSection from "@/components/ui/ScrollRevealSection";
import { formatLots } from "@/lib/lot-size";
import {
  PER_PAIR_SYMBOLS,
  describePair,
  isSupportedPairSlug,
  pairExample,
  pairToSlug,
  slugToPair,
} from "@/lib/pair-meta";

const BASE = "https://intellitrade.tech";

// Only the symbols we pre-render exist; any other slug 404s instead of being
// generated on demand (keeps the URL space closed and the canonical set tidy).
export const dynamicParams = false;

export function generateStaticParams(): { pair: string }[] {
  return PER_PAIR_SYMBOLS.map((symbol) => ({ pair: pairToSlug(symbol) }));
}

// ─── Copy helpers ───────────────────────────────────────────────────────────

/** Format a quote-currency amount: USD gets a $ prefix, others a code suffix. */
const fmtQuote = (amount: number, quote: string): string => {
  const n = amount.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return quote === "USD" ? `$${n}` : `${n} ${quote}`;
};

const fmtPip = (pipSize: number): string =>
  pipSize >= 1 ? `${pipSize}` : pipSize.toString();

// ─── Metadata ───────────────────────────────────────────────────────────────

export async function generateMetadata({
  params,
}: {
  params: Promise<{ pair: string }>;
}): Promise<Metadata> {
  const { pair: slug } = await params;
  if (!isSupportedPairSlug(slug)) return { title: "Pair Not Found · IntelliTrade" };

  const m = describePair(slugToPair(slug));
  const url = `${BASE}/lotsizecalculator/${m.slug}`;
  const title = `${m.display} Lot Size Calculator | Position Size for ${m.display} | IntelliTrade`;
  const description = `Free ${m.display} lot size calculator. Work out the exact position size for ${m.longName} from your account balance, risk percentage and stop loss, with live exchange rate conversion and broker-ready rounding.`;

  return {
    title,
    description,
    // Self-canonical: each per-pair page targets its own long-tail query
    // ("eurusd lot size calculator") and complements the generic hub page.
    alternates: { canonical: url },
    openGraph: {
      title: `${m.display} Lot Size Calculator`,
      description,
      url,
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title: `${m.display} Lot Size Calculator`,
      description,
    },
  };
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function PerPairLotSizePage({
  params,
}: {
  params: Promise<{ pair: string }>;
}) {
  const { pair: slug } = await params;
  if (!isSupportedPairSlug(slug)) notFound();

  const m = describePair(slugToPair(slug));
  const ex = pairExample(m.pair);
  const url = `${BASE}/lotsizecalculator/${m.slug}`;

  const assetWord =
    m.assetClass === "metal"
      ? "metal"
      : m.assetClass === "crypto"
        ? "crypto pair"
        : m.assetClass === "fx-cross"
          ? "cross pair"
          : "forex pair";

  // A few sibling pages for internal linking (exclude self, cap at 6).
  const siblings = PER_PAIR_SYMBOLS.filter((s) => s !== m.pair).slice(0, 6);

  const softwareAppSchema = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: `IntelliTrade ${m.display} Lot Size Calculator`,
    applicationCategory: "FinanceApplication",
    operatingSystem: "Web",
    offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
    description: `Free position size calculator for ${m.longName} (${m.display}). Determines the correct lot size from account balance, risk percentage, stop loss and live exchange rates.`,
    url,
  };

  const breadcrumbSchema = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: `${BASE}/` },
      { "@type": "ListItem", position: 2, name: "Lot Size Calculator", item: `${BASE}/lotsizecalculator` },
      { "@type": "ListItem", position: 3, name: `${m.display}`, item: url },
    ],
  };

  const faqs = [
    {
      q: `How do I calculate the lot size for ${m.display}?`,
      a: `Enter your account balance and currency, choose ${m.display}, set your risk per trade as a percentage (for example 1%), and enter your stop loss. The calculator multiplies balance by risk% to get the money at risk, then divides that by your stop distance times the ${m.display} pip value per lot. When your account currency differs from ${m.quoteName} (${m.quote}), the pip value is converted with live exchange rates before the lot size is worked out.`,
    },
    {
      q: `What is one pip of ${m.display} worth?`,
      a: `One pip of ${m.display} moves the value of a 1.00 lot by ${fmtQuote(m.pipValueQuote, m.quote)}. This is the contract size (${m.contractSize.toLocaleString("en-US")} ${m.unitLabel}) multiplied by the pip size (${fmtPip(m.pipSize)}). ${m.quote === "USD" ? "Because the pair is quoted in US dollars, that pip value is already in dollars." : `Because ${m.display} is quoted in ${m.quoteName}, that pip value is in ${m.quote}; the calculator converts it to your account currency automatically.`}`,
    },
    {
      q: `What is 1 lot of ${m.display}?`,
      a: `A standard 1.00 lot of ${m.display} represents ${m.contractSize.toLocaleString("en-US")} ${m.unitLabel}. A 0.10 lot is a tenth of that and a 0.01 lot (a micro lot) is a hundredth. Brokers can define contract sizes differently, so confirm the specification in your MT4/MT5 symbol details before sizing a live trade.`,
    },
    {
      q: `Why does the calculator show an exact size and a broker-ready size?`,
      a: `The exact size is the pure mathematical answer, for example 0.0167 lots. Most brokers only accept volumes on a grid set by a minimum lot and lot step (often 0.01), so the broker-ready size is the largest valid volume at or below the exact size. It never rounds up, so your actual risk on ${m.display} never exceeds the risk you set.`,
    },
    {
      q: `Does the ${m.display} lot size depend on my account currency?`,
      a: `${m.quote === "USD" ? `${m.display} is quoted in US dollars, so a USD account needs no conversion. For any other account currency, the calculator converts the pip value with live rates, which can make the same trade look slightly larger or smaller.` : `Yes. ${m.display} is quoted in ${m.quoteName} (${m.quote}), so unless your account is in ${m.quote} the calculator converts the pip value to your account currency with live exchange rates. Two accounts in different currencies can therefore get slightly different lot sizes for the same trade.`}`,
    },
  ];

  const faqSchemaData = {
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
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(softwareAppSchema) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(faqSchemaData) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(breadcrumbSchema) }} />

      <NoSmoothScroll />

      <div className="mx-auto max-w-4xl px-4 pb-28 pt-10 sm:px-8">
        {/* ── Breadcrumb ─────────────────────────────────────────────────────── */}
        <nav aria-label="Breadcrumb" className="mb-6 text-[12px] text-white/40">
          <ol className="flex flex-wrap items-center gap-1.5">
            <li>
              <Link href="/lotsizecalculator" className="inline-flex items-center gap-1 transition hover:text-white/70">
                <ArrowLeft className="h-3 w-3" />
                Lot Size Calculator
              </Link>
            </li>
            <li aria-hidden className="text-white/25">/</li>
            <li className="text-white/60">{m.display}</li>
          </ol>
        </nav>

        {/* ── Hero ───────────────────────────────────────────────────────────── */}
        <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight text-white sm:text-4xl">
              {m.display} Lot Size Calculator
            </h1>
            <p className="mt-1 text-[13px] uppercase tracking-[0.18em] text-white/40">
              Position size calculator for {m.longName}
            </p>
            <p className="mt-3 max-w-xl text-sm leading-relaxed text-white/50 sm:text-base">
              Work out the correct {m.display} position size from your account balance, risk per
              trade and stop loss. {m.display} is a {assetWord} quoted in {m.quoteName}; the
              calculator handles its pip value and live currency conversion for you.
            </p>

            <div className="mt-4 flex flex-wrap gap-2">
              {["Live exchange rates", `Pre-set to ${m.display}`, "Risk-based sizing", "Free tool"].map(
                (label) => (
                  <span
                    key={label}
                    className="inline-flex items-center rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-[11px] text-white/50"
                  >
                    {label}
                  </span>
                )
              )}
            </div>
          </div>

          <Link
            href="/lotsizecalculator/faq"
            className="self-center sm:self-auto inline-flex shrink-0 items-center gap-2 rounded-full border border-white/20 bg-white/[0.08] px-5 py-2.5 text-sm font-medium text-white transition-all hover:border-white/40 hover:bg-white/[0.12]"
          >
            <BookOpen className="h-4 w-4" />
            Guide &amp; FAQ
          </Link>
        </div>

        {/* ── Calculator (pre-selected to this pair) ─────────────────────────── */}
        <div className="relative overflow-hidden rounded-3xl border border-white/20 bg-clip-padding p-6 shadow-[0_32px_80px_rgba(0,0,0,0.85)] md:p-10">
          <div className="radial-backdrop" />
          <div className="relative z-10">
            <LotSizeCalculator initialPair={m.pair} />
          </div>
        </div>

        <p className="mt-4 text-center text-[11px] text-white/28">
          For educational and planning purposes only. Always verify {m.display} contract details with
          your broker.
        </p>

        {/* ── Pair facts ─────────────────────────────────────────────────────── */}
        <ScrollRevealSection className="mt-20">
          <section aria-labelledby="facts-heading">
            <div className="relative overflow-hidden rounded-3xl border border-white/20 bg-clip-padding p-6 shadow-[0_32px_80px_rgba(0,0,0,0.85)] md:p-10">
              <div className="radial-backdrop" />
              <div className="relative z-10">
                <div className="inline-flex items-center rounded-full border border-brand bg-white/5 px-4 py-1 text-[11px] font-medium tracking-[0.22em] text-brand-200/90">
                  {m.display} FACTS
                </div>
                <h2
                  id="facts-heading"
                  className="mt-4 text-2xl font-semibold tracking-tight text-slate-50 md:text-[26px]"
                >
                  {m.display} contract specification
                </h2>
                <p className="mt-4 text-[15px] leading-relaxed text-slate-200/90">
                  These are the standard values the calculator uses for {m.longName}. Your broker may
                  define them differently for {assetWord}s, so check the symbol specification in
                  MT4/MT5 if a result looks off.
                </p>

                <dl className="mt-8 grid gap-4 sm:grid-cols-2">
                  {[
                    { k: "Base / quote", v: `${m.baseName} (${m.base}) / ${m.quoteName} (${m.quote})` },
                    { k: "Pip size", v: fmtPip(m.pipSize) },
                    { k: "Contract size (1.00 lot)", v: `${m.contractSize.toLocaleString("en-US")} ${m.unitLabel}` },
                    { k: "Pip value per 1.00 lot", v: `${fmtQuote(m.pipValueQuote, m.quote)}` },
                  ].map(({ k, v }) => (
                    <div key={k} className="rounded-2xl border border-white/15 bg-white/5 p-5 backdrop-blur-xl">
                      <dt className="text-[11px] font-semibold uppercase tracking-[0.25em] text-brand-300/90">
                        {k}
                      </dt>
                      <dd className="mt-2 text-[15px] font-medium text-slate-100">{v}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            </div>
          </section>
        </ScrollRevealSection>

        {/* ── Worked example ─────────────────────────────────────────────────── */}
        <ScrollRevealSection className="mt-10" delay={0.04}>
          <section aria-labelledby="example-heading">
            <div className="relative overflow-hidden rounded-3xl border border-white/20 bg-clip-padding p-6 shadow-[0_32px_80px_rgba(0,0,0,0.85)] md:p-10">
              <div className="radial-backdrop" />
              <div className="relative z-10">
                <div className="inline-flex items-center rounded-full border border-brand bg-white/5 px-4 py-1 text-[11px] font-medium tracking-[0.22em] text-brand-200/90">
                  WORKED EXAMPLE
                </div>
                <h2
                  id="example-heading"
                  className="mt-4 text-2xl font-semibold tracking-tight text-slate-50 md:text-[26px]"
                >
                  {m.display} position size example
                </h2>
                <p className="mt-4 text-[15px] leading-relaxed text-slate-200/90">
                  A ${ex.balance.toLocaleString("en-US")} account risking {ex.riskPercent}% (
                  {fmtQuote(ex.riskAmount, "USD")}) on {m.display} with a {ex.stopPips}-pip stop:
                </p>

                <div className="mt-8 grid gap-4 sm:grid-cols-3">
                  <div className="rounded-2xl border border-white/15 bg-white/5 p-5 backdrop-blur-xl">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.25em] text-brand-300/90">
                      Inputs
                    </p>
                    <dl className="mt-4 space-y-1.5 text-[12px]">
                      <div className="flex justify-between">
                        <dt className="text-slate-400">Balance</dt>
                        <dd className="text-slate-100">${ex.balance.toLocaleString("en-US")}</dd>
                      </div>
                      <div className="flex justify-between">
                        <dt className="text-slate-400">Risk</dt>
                        <dd className="text-slate-100">
                          {ex.riskPercent}% ({fmtQuote(ex.riskAmount, "USD")})
                        </dd>
                      </div>
                      <div className="flex justify-between">
                        <dt className="text-slate-400">Stop loss</dt>
                        <dd className="text-slate-100">{ex.stopPips} pips</dd>
                      </div>
                    </dl>
                  </div>

                  <div className="rounded-2xl border border-white/15 bg-white/5 p-5 backdrop-blur-xl">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.25em] text-brand-300/90">
                      Risk per lot
                    </p>
                    <p className="mt-4 text-[13px] leading-relaxed text-slate-300/85">
                      {ex.stopPips} pips × {fmtQuote(ex.pipValueQuote, m.quote)} per pip
                    </p>
                    <div className="mt-4 border-t border-white/8 pt-4">
                      <p className="text-[10px] uppercase tracking-[0.2em] text-white/35">= Risk / 1.00 lot</p>
                      <p className="mt-1 text-xl font-semibold text-white">
                        {fmtQuote(ex.riskPerLot, m.quote)}
                      </p>
                    </div>
                  </div>

                  <div className="rounded-2xl border border-white/15 bg-white/5 p-5 backdrop-blur-xl">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.25em] text-brand-300/90">
                      Position size
                    </p>
                    <p className="mt-4 text-[13px] leading-relaxed text-slate-300/85">
                      {fmtQuote(ex.riskAmount, "USD")} risk ÷ {fmtQuote(ex.riskPerLot, m.quote)} per lot
                    </p>
                    <div className="mt-4 border-t border-white/8 pt-4">
                      <p className="text-[10px] uppercase tracking-[0.2em] text-white/35">≈ Lots</p>
                      <p className="mt-1 text-xl font-semibold text-white">{formatLots(ex.lots)} lots</p>
                    </div>
                  </div>
                </div>

                <div className="mt-6 rounded-2xl border border-brand/20 bg-brand/5 px-5 py-4 text-[13px] leading-relaxed text-slate-300/90">
                  <span className="font-semibold text-brand-300/90">Note: </span>
                  {m.quote === "USD"
                    ? `The pip value is already in US dollars, so a USD account gets exactly ${formatLots(ex.lots)} lots. In another account currency the calculator converts the pip value with live rates first.`
                    : `The risk-per-lot figure is in ${m.quote}. With a ${m.quote} account that is ${formatLots(ex.lots)} lots; in any other account currency the calculator converts the ${m.quote} pip value to your currency with live rates before sizing.`}
                </div>
              </div>
            </div>
          </section>
        </ScrollRevealSection>

        {/* ── FAQ ────────────────────────────────────────────────────────────── */}
        <ScrollRevealSection className="mt-10" delay={0.04}>
          <section aria-labelledby="faq-heading">
            <div className="relative overflow-hidden rounded-3xl border border-white/20 bg-clip-padding p-6 shadow-[0_32px_80px_rgba(0,0,0,0.85)] md:p-10">
              <div className="radial-backdrop" />
              <div className="relative z-10">
                <div className="inline-flex items-center rounded-full border border-brand bg-white/5 px-4 py-1 text-[11px] font-medium tracking-[0.22em] text-brand-200/90">
                  {m.display} FAQ
                </div>
                <h2
                  id="faq-heading"
                  className="mt-4 text-2xl font-semibold tracking-tight text-slate-50 md:text-[26px]"
                >
                  {m.display} lot size FAQs
                </h2>

                <div className="mt-8 space-y-3">
                  {faqs.map(({ q, a }) => (
                    <details
                      key={q}
                      className="group overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-xl"
                    >
                      <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 text-[14px] font-medium text-slate-100 transition hover:text-white">
                        <h3 className="text-[14px] font-medium">{q}</h3>
                        <svg
                          className="h-4 w-4 shrink-0 text-white/38 transition-transform duration-200 group-open:rotate-180"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                          aria-hidden="true"
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                      </summary>
                      <div className="px-5 pb-5 text-[14px] leading-relaxed text-slate-200/80">{a}</div>
                    </details>
                  ))}
                </div>

                <div className="mt-6 text-center">
                  <Link
                    href="/lotsizecalculator/faq"
                    className="inline-flex items-center gap-2 text-[13px] text-brand-300/80 transition hover:text-brand-200"
                  >
                    Read the full guide &amp; FAQ
                    <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                </div>
              </div>
            </div>
          </section>
        </ScrollRevealSection>

        {/* ── Other pairs + related ──────────────────────────────────────────── */}
        <ScrollRevealSection className="mt-10" delay={0.04}>
          <section aria-labelledby="related-heading">
            <div className="relative overflow-hidden rounded-3xl border border-white/20 bg-clip-padding p-6 shadow-[0_32px_80px_rgba(0,0,0,0.85)] md:p-10">
              <div className="radial-backdrop" />
              <div className="relative z-10">
                <div className="inline-flex items-center rounded-full border border-brand bg-white/5 px-4 py-1 text-[11px] font-medium tracking-[0.22em] text-brand-200/90">
                  RESOURCES
                </div>
                <h2
                  id="related-heading"
                  className="mt-4 text-2xl font-semibold tracking-tight text-slate-50 md:text-[26px]"
                >
                  Lot size calculators for other pairs
                </h2>

                <div className="mt-8 flex flex-wrap gap-2">
                  {siblings.map((s) => {
                    const sm = describePair(s);
                    return (
                      <Link
                        key={s}
                        href={`/lotsizecalculator/${sm.slug}`}
                        className="inline-flex items-center rounded-full border border-white/15 bg-white/5 px-4 py-2 text-[13px] text-slate-200/90 transition hover:border-white/25 hover:bg-white/[0.08] hover:text-white"
                      >
                        {sm.display}
                      </Link>
                    );
                  })}
                </div>

                <div className="mt-8 grid gap-4 sm:grid-cols-2">
                  <Link
                    href="/lotsizecalculator"
                    className="group rounded-2xl border border-white/15 bg-white/5 p-5 backdrop-blur-xl transition hover:border-white/20 hover:bg-white/[0.07]"
                  >
                    <p className="text-[11px] font-semibold uppercase tracking-[0.25em] text-brand-300/90">Tool</p>
                    <p className="mt-2 text-[15px] font-medium text-slate-100 group-hover:text-white">
                      All-pairs Lot Size Calculator
                    </p>
                    <p className="mt-1 text-[13px] text-slate-400/80">
                      The full calculator with every supported instrument, broker overrides and saved
                      account templates.
                    </p>
                  </Link>

                  <Link
                    href="/pipvaluecalculator"
                    className="group rounded-2xl border border-white/15 bg-white/5 p-5 backdrop-blur-xl transition hover:border-white/20 hover:bg-white/[0.07]"
                  >
                    <p className="text-[11px] font-semibold uppercase tracking-[0.25em] text-brand-300/90">Tool</p>
                    <p className="mt-2 text-[15px] font-medium text-slate-100 group-hover:text-white">
                      Pip Value Calculator
                    </p>
                    <p className="mt-1 text-[13px] text-slate-400/80">
                      Find what one pip of {m.display} is worth in your account currency across
                      standard, mini and micro lots.
                    </p>
                  </Link>
                </div>
              </div>
            </div>
          </section>
        </ScrollRevealSection>
      </div>
    </>
  );
}
