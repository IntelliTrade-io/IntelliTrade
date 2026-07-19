import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, ArrowRight, Calculator } from "lucide-react";
import { jsonLd } from "@/lib/jsonLd";
import PipValueCalculator from "@/components/calculators/PipValueCalculator";
import ScrollRevealSection from "@/components/ui/ScrollRevealSection";
import {
  PER_PAIR_SYMBOLS,
  describePair,
  isSupportedPairSlug,
  pairToSlug,
  pipValueLots,
  slugToPair,
} from "@/lib/pair-meta";
import { strengthPairFromSlug } from "@/lib/strength-pairs";

const BASE = "https://intellitrade.tech";

export const dynamicParams = false;

export function generateStaticParams(): { pair: string }[] {
  return PER_PAIR_SYMBOLS.map((symbol) => ({ pair: pairToSlug(symbol) }));
}

/** Format a quote-currency amount: USD gets a $ prefix, others a code suffix. */
const fmtQuote = (amount: number, quote: string): string => {
  const n = amount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return quote === "USD" ? `$${n}` : `${n} ${quote}`;
};

const fmtPip = (pipSize: number): string => (pipSize >= 1 ? `${pipSize}` : pipSize.toString());

export async function generateMetadata({
  params,
}: {
  params: Promise<{ pair: string }>;
}): Promise<Metadata> {
  const { pair: slug } = await params;
  if (!isSupportedPairSlug(slug)) return { title: "Pair Not Found · IntelliTrade" };

  const m = describePair(slugToPair(slug));
  const url = `${BASE}/pipvaluecalculator/${m.slug}`;
  const title = `${m.display} Pip Value Calculator | Pip Value for ${m.display} | IntelliTrade`;
  const description = `Free ${m.display} pip value calculator. Find what one pip of ${m.longName} is worth in your account currency for standard, mini and micro lots, with live exchange rate conversion.`;

  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: { title: `${m.display} Pip Value Calculator`, description, url, type: "website" },
    twitter: { card: "summary_large_image", title: `${m.display} Pip Value Calculator`, description },
  };
}

export default async function PerPairPipValuePage({
  params,
}: {
  params: Promise<{ pair: string }>;
}) {
  const { pair: slug } = await params;
  if (!isSupportedPairSlug(slug)) notFound();

  const m = describePair(slugToPair(slug));
  const v = pipValueLots(m.pair);
  const url = `${BASE}/pipvaluecalculator/${m.slug}`;

  const assetWord =
    m.assetClass === "metal"
      ? "metal"
      : m.assetClass === "crypto"
        ? "crypto pair"
        : m.assetClass === "fx-cross"
          ? "cross pair"
          : "forex pair";

  const siblings = PER_PAIR_SYMBOLS.filter((s) => s !== m.pair).slice(0, 6);

  // Free strength pages only exist for the 28 standard major pairs (no
  // metals/crypto/reversed majors), so only link where the page exists.
  const hasStrengthPage = strengthPairFromSlug(m.slug) !== null;

  const softwareAppSchema = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: `IntelliTrade ${m.display} Pip Value Calculator`,
    applicationCategory: "FinanceApplication",
    operatingSystem: "Web",
    offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
    description: `Free pip value calculator for ${m.longName} (${m.display}). Shows the value of one pip in your account currency for standard, mini and micro lots using live exchange rates.`,
    url,
  };

  const breadcrumbSchema = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: `${BASE}/` },
      { "@type": "ListItem", position: 2, name: "Pip Value Calculator", item: `${BASE}/pipvaluecalculator` },
      { "@type": "ListItem", position: 3, name: `${m.display}`, item: url },
    ],
  };

  const quoteMatchNote =
    m.quote === "USD"
      ? `Because ${m.display} is quoted in US dollars, these values are already in dollars for a USD account and need no conversion.`
      : `These values are in ${m.quoteName} (${m.quote}). The calculator converts them to your account currency with live exchange rates, so the pip value shifts as ${m.quote} moves.`;

  const faqs = [
    {
      q: `What is the pip value of ${m.display}?`,
      a: `One pip of ${m.display} is worth ${fmtQuote(v.standard, m.quote)} per standard (1.00) lot, ${fmtQuote(v.mini, m.quote)} per mini (0.10) lot and ${fmtQuote(v.micro, m.quote)} per micro (0.01) lot. This is the contract size (${m.contractSize.toLocaleString("en-US")} ${m.unitLabel}) times the pip size (${fmtPip(m.pipSize)}). ${quoteMatchNote}`,
    },
    {
      q: `How is ${m.display} pip value calculated?`,
      a: `Pip value per standard lot = pip size × contract size × the rate that converts ${m.quoteName} into your account currency. For ${m.display} that is ${fmtPip(m.pipSize)} × ${m.contractSize.toLocaleString("en-US")} = ${fmtQuote(v.standard, m.quote)} per pip in ${m.quote}. It then scales linearly with position size and is converted to your account currency if that differs from ${m.quote}.`,
    },
    {
      q: `Why does ${m.display} pip value change with the exchange rate?`,
      a: `${m.quote === "USD" ? `${m.display} is quoted in US dollars, so for a USD account the pip value is fixed per lot. For any other account currency the calculator converts it at the live rate, so it moves as that rate moves.` : `${m.display} is quoted in ${m.quoteName}, so unless your account is in ${m.quote} the pip value has to be converted back into your currency at the current rate. As that rate moves, the converted pip value moves with it.`}`,
    },
    {
      q: `What is a standard, mini and micro lot for ${m.display}?`,
      a: `A standard 1.00 lot of ${m.display} is ${m.contractSize.toLocaleString("en-US")} ${m.unitLabel}, a mini lot is a tenth of that (0.10) and a micro lot a hundredth (0.01). Pip value scales directly with lot size, so a mini lot is worth a tenth of a standard lot per pip and a micro lot a hundredth.`,
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

      <div className="mx-auto max-w-4xl px-4 pb-28 pt-10 sm:px-8">
        {/* ── Breadcrumb ─────────────────────────────────────────────────────── */}
        <nav aria-label="Breadcrumb" className="mb-6 text-[12px] text-white/40">
          <ol className="flex flex-wrap items-center gap-1.5">
            <li>
              <Link href="/pipvaluecalculator" className="inline-flex items-center gap-1 transition hover:text-white/70">
                <ArrowLeft className="h-3 w-3" />
                Pip Value Calculator
              </Link>
            </li>
            <li aria-hidden className="text-white/25">/</li>
            <li className="text-white/60">{m.display}</li>
          </ol>
        </nav>

        {/* ── Hero ───────────────────────────────────────────────────────────── */}
        <div className="mb-8">
          <h1 className="text-3xl font-semibold tracking-tight text-white sm:text-4xl">
            {m.display} Pip Value Calculator
          </h1>
          <p className="mt-1 text-[13px] uppercase tracking-[0.18em] text-white/40">
            Pip value for {m.longName}
          </p>
          <p className="mt-3 max-w-xl text-sm leading-relaxed text-white/50 sm:text-base">
            Find what one pip of {m.display} is worth in your account currency for any position size.
            {m.display} is a {assetWord} quoted in {m.quoteName}; the calculator applies its pip size
            and live currency conversion for you.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            {["Live exchange rates", `Pre-set to ${m.display}`, "Standard / mini / micro", "Free tool"].map(
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

        {/* ── Calculator (pre-selected to this pair) ─────────────────────────── */}
        <div className="relative overflow-hidden rounded-3xl border border-white/20 bg-clip-padding p-6 shadow-[0_32px_80px_rgba(0,0,0,0.85)] md:p-10">
          <div className="radial-backdrop" />
          <div className="relative z-10">
            <PipValueCalculator initialPair={m.pair} />
          </div>
        </div>

        <p className="mt-4 text-center text-[11px] text-white/28">
          For educational and planning purposes only. Always verify {m.display} contract details with
          your broker.
        </p>

        {/* ── Pip value table ────────────────────────────────────────────────── */}
        <ScrollRevealSection className="mt-20">
          <section aria-labelledby="values-heading">
            <div className="relative overflow-hidden rounded-3xl border border-white/20 bg-clip-padding p-6 shadow-[0_32px_80px_rgba(0,0,0,0.85)] md:p-10">
              <div className="radial-backdrop" />
              <div className="relative z-10">
                <div className="inline-flex items-center rounded-full border border-brand bg-white/5 px-4 py-1 text-[11px] font-medium tracking-[0.22em] text-brand-200/90">
                  {m.display} PIP VALUE
                </div>
                <h2
                  id="values-heading"
                  className="mt-4 text-2xl font-semibold tracking-tight text-slate-50 md:text-[26px]"
                >
                  {m.display} pip value per lot
                </h2>
                <p className="mt-4 text-[15px] leading-relaxed text-slate-200/90">
                  {m.display} has a pip size of {fmtPip(m.pipSize)} and a standard contract of{" "}
                  {m.contractSize.toLocaleString("en-US")} {m.unitLabel}. {quoteMatchNote}
                </p>

                <div className="mt-8 grid gap-4 sm:grid-cols-3">
                  {[
                    { label: "Standard lot", sub: "1.00", val: v.standard },
                    { label: "Mini lot", sub: "0.10", val: v.mini },
                    { label: "Micro lot", sub: "0.01", val: v.micro },
                  ].map(({ label, sub, val }) => (
                    <div key={label} className="rounded-2xl border border-white/15 bg-white/5 p-5 backdrop-blur-xl">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.25em] text-brand-300/90">
                        {label}
                      </p>
                      <p className="mt-1 text-[11px] text-white/35">{sub} lot</p>
                      <div className="mt-4 border-t border-white/8 pt-4">
                        <p className="text-[10px] uppercase tracking-[0.2em] text-white/35">Per pip</p>
                        <p className="mt-1 text-xl font-semibold text-white">{fmtQuote(val, m.quote)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </section>
        </ScrollRevealSection>

        {/* ── FAQ ────────────────────────────────────────────────────────────── */}
        <ScrollRevealSection className="mt-8">
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
                  {m.display} pip value questions
                </h2>
                <div className="mt-6 space-y-3">
                  {faqs.map(({ q, a }) => (
                    <details key={q} className="group rounded-2xl border border-white/12 bg-white/[0.03] p-5">
                      <summary className="flex cursor-pointer items-center justify-between gap-4 text-[15px] font-medium text-slate-100 marker:content-['']">
                        <h3 className="text-[15px] font-medium">{q}</h3>
                        <span className="shrink-0 text-white/40 transition-transform group-open:rotate-45">+</span>
                      </summary>
                      <p className="mt-3 text-[14px] leading-relaxed text-white/60">{a}</p>
                    </details>
                  ))}
                </div>
              </div>
            </div>
          </section>
        </ScrollRevealSection>

        {/* ── Other pairs + related ──────────────────────────────────────────── */}
        <ScrollRevealSection className="mt-8">
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
                  Pip value calculators for other pairs
                </h2>

                <div className="mt-8 flex flex-wrap gap-2">
                  {siblings.map((s) => {
                    const sm = describePair(s);
                    return (
                      <Link
                        key={s}
                        href={`/pipvaluecalculator/${sm.slug}`}
                        className="inline-flex items-center rounded-full border border-white/15 bg-white/5 px-4 py-2 text-[13px] text-slate-200/90 transition hover:border-white/25 hover:bg-white/[0.08] hover:text-white"
                      >
                        {sm.display}
                      </Link>
                    );
                  })}
                </div>

                <div className={`mt-8 grid gap-4 ${hasStrengthPage ? "sm:grid-cols-3" : "sm:grid-cols-2"}`}>
                  <Link
                    href={`/lotsizecalculator/${m.slug}`}
                    className="group rounded-2xl border border-white/15 bg-white/5 p-5 backdrop-blur-xl transition hover:border-white/20 hover:bg-white/[0.07]"
                  >
                    <p className="text-[11px] font-semibold uppercase tracking-[0.25em] text-brand-300/90">Tool</p>
                    <p className="mt-2 flex items-center gap-2 text-[15px] font-medium text-slate-100 group-hover:text-white">
                      <Calculator className="h-4 w-4" />
                      {m.display} Lot Size Calculator
                    </p>
                    <p className="mt-1 text-[13px] text-slate-400/80">
                      Size a {m.display} position from your account balance, risk and stop loss.
                    </p>
                  </Link>

                  <Link
                    href="/pipvaluecalculator"
                    className="group rounded-2xl border border-white/15 bg-white/5 p-5 backdrop-blur-xl transition hover:border-white/20 hover:bg-white/[0.07]"
                  >
                    <p className="text-[11px] font-semibold uppercase tracking-[0.25em] text-brand-300/90">Tool</p>
                    <p className="mt-2 flex items-center gap-2 text-[15px] font-medium text-slate-100 group-hover:text-white">
                      All-pairs Pip Value Calculator
                      <ArrowRight className="h-3.5 w-3.5" />
                    </p>
                    <p className="mt-1 text-[13px] text-slate-400/80">
                      The full pip value calculator with every supported instrument and account
                      currency.
                    </p>
                  </Link>

                  {hasStrengthPage && (
                    <Link
                      href={`/currency-strength/${m.slug}`}
                      className="group rounded-2xl border border-white/15 bg-white/5 p-5 backdrop-blur-xl transition hover:border-white/20 hover:bg-white/[0.07]"
                    >
                      <p className="text-[11px] font-semibold uppercase tracking-[0.25em] text-brand-300/90">Free</p>
                      <p className="mt-2 text-[15px] font-medium text-slate-100 group-hover:text-white">
                        {m.display} Currency Strength
                      </p>
                      <p className="mt-1 text-[13px] text-slate-400/80">
                        Which side of {m.display} read stronger in yesterday&apos;s daily reading.
                      </p>
                    </Link>
                  )}
                </div>
              </div>
            </div>
          </section>
        </ScrollRevealSection>
      </div>
    </>
  );
}
