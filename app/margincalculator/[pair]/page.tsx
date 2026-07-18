import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, ArrowRight, Calculator, Gauge } from "lucide-react";
import { jsonLd } from "@/lib/jsonLd";
import MarginCalculator from "@/components/calculators/MarginCalculator";
import ScrollRevealSection from "@/components/ui/ScrollRevealSection";
import {
  PER_PAIR_SYMBOLS,
  describePair,
  isSupportedPairSlug,
  pairToSlug,
  slugToPair,
} from "@/lib/pair-meta";

const BASE = "https://intellitrade.tech";

export const dynamicParams = false;

export function generateStaticParams(): { pair: string }[] {
  return PER_PAIR_SYMBOLS.map((symbol) => ({ pair: pairToSlug(symbol) }));
}

// Common retail leverage tiers. Margin requirement is 1/leverage of the
// notional — pair-independent, but a real reference and a genuine long-tail
// query ("eurusd margin requirement"). Metals/crypto are often capped lower;
// the copy says so rather than implying every tier is available on every pair.
const LEVERAGES = [10, 20, 30, 100, 200, 500];
const marginPct = (leverage: number): string => `${(100 / leverage).toFixed(2)}%`;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ pair: string }>;
}): Promise<Metadata> {
  const { pair: slug } = await params;
  if (!isSupportedPairSlug(slug)) return { title: "Pair Not Found · IntelliTrade" };

  const m = describePair(slugToPair(slug));
  const url = `${BASE}/margincalculator/${m.slug}`;
  const title = `${m.display} Margin Calculator | Required Margin & Leverage for ${m.display} | IntelliTrade`;
  const description = `Free ${m.display} margin calculator. Work out the margin required to open a leveraged ${m.longName} position in your account currency, at any leverage, with live exchange rates.`;

  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: { title: `${m.display} Margin Calculator`, description, url, type: "website" },
    twitter: { card: "summary_large_image", title: `${m.display} Margin Calculator`, description },
  };
}

export default async function PerPairMarginPage({
  params,
}: {
  params: Promise<{ pair: string }>;
}) {
  const { pair: slug } = await params;
  if (!isSupportedPairSlug(slug)) notFound();

  const m = describePair(slugToPair(slug));
  const url = `${BASE}/margincalculator/${m.slug}`;

  const assetWord =
    m.assetClass === "metal"
      ? "metal"
      : m.assetClass === "crypto"
        ? "crypto pair"
        : m.assetClass === "fx-cross"
          ? "cross pair"
          : "forex pair";

  const capNote =
    m.assetClass === "metal" || m.assetClass === "crypto"
      ? ` Brokers usually cap leverage on ${assetWord}s well below the forex maximum, so confirm the limit and margin rate for ${m.display} with your broker.`
      : "";

  const siblings = PER_PAIR_SYMBOLS.filter((s) => s !== m.pair).slice(0, 6);

  const softwareAppSchema = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: `IntelliTrade ${m.display} Margin Calculator`,
    applicationCategory: "FinanceApplication",
    operatingSystem: "Web",
    offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
    description: `Free margin and leverage calculator for ${m.longName} (${m.display}). Calculates the margin required to open a leveraged position in your account currency using live exchange rates.`,
    url,
  };

  const breadcrumbSchema = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: `${BASE}/` },
      { "@type": "ListItem", position: 2, name: "Margin Calculator", item: `${BASE}/margincalculator` },
      { "@type": "ListItem", position: 3, name: `${m.display}`, item: url },
    ],
  };

  const faqs = [
    {
      q: `How much margin do I need to trade ${m.display}?`,
      a: `Required margin for ${m.display} = the position's notional value ÷ your leverage, in your account currency. The notional is your lots × the contract size (${m.contractSize.toLocaleString("en-US")} ${m.unitLabel}) valued at the current price and converted from ${m.baseName} into your account currency. For example, at 1:30 leverage the margin is 1/30 (about 3.33%) of that notional.${capNote}`,
    },
    {
      q: `What is the margin requirement percentage for ${m.display}?`,
      a: `The margin requirement is 1 ÷ leverage of the notional and does not depend on the pair itself: 1:30 needs ${marginPct(30)}, 1:100 needs ${marginPct(100)} and 1:500 needs ${marginPct(500)}. What changes per instrument is the maximum leverage your broker allows.${capNote}`,
    },
    {
      q: `Why does ${m.display} required margin change with the exchange rate?`,
      a: `The notional value of a ${m.display} position is measured in ${m.baseName} (${m.base}) and converted into your account currency at the live rate. When that rate moves, the account-currency value of the same position moves with it, so the required margin shifts. ${m.base === "USD" ? "For a USD account trading a USD-base pair, no conversion is applied and margin stays fixed for a given size and leverage." : "If your account currency equals the base currency, no conversion applies and margin stays fixed for a given size and leverage."}`,
    },
    {
      q: `Does higher leverage reduce my risk on ${m.display}?`,
      a: `No. Higher leverage only lowers the margin required to open the ${m.display} position; it does not reduce the money at risk. The position still gains or loses the same amount per pip regardless of leverage. Use the lot size calculator to control risk, and this calculator to see the margin a position ties up.`,
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
              <Link href="/margincalculator" className="inline-flex items-center gap-1 transition hover:text-white/70">
                <ArrowLeft className="h-3 w-3" />
                Margin Calculator
              </Link>
            </li>
            <li aria-hidden className="text-white/25">/</li>
            <li className="text-white/60">{m.display}</li>
          </ol>
        </nav>

        {/* ── Hero ───────────────────────────────────────────────────────────── */}
        <div className="mb-8">
          <h1 className="text-3xl font-semibold tracking-tight text-white sm:text-4xl">
            {m.display} Margin Calculator
          </h1>
          <p className="mt-1 text-[13px] uppercase tracking-[0.18em] text-white/40">
            Required margin &amp; leverage for {m.longName}
          </p>
          <p className="mt-3 max-w-xl text-sm leading-relaxed text-white/50 sm:text-base">
            Work out the margin needed to open a leveraged {m.display} position in your account
            currency. {m.display} is a {assetWord} with a {m.contractSize.toLocaleString("en-US")}{" "}
            {m.unitLabel} standard contract; the calculator converts its notional from {m.baseName}
            for you.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            {["Live exchange rates", `Pre-set to ${m.display}`, "Any leverage", "Free tool"].map(
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
            <MarginCalculator initialPair={m.pair} />
          </div>
        </div>

        <p className="mt-4 text-center text-[11px] text-white/28">
          For educational and planning purposes only. Always verify {m.display} contract details and
          leverage limits with your broker.
        </p>

        {/* ── Margin by leverage ─────────────────────────────────────────────── */}
        <ScrollRevealSection className="mt-20">
          <section aria-labelledby="leverage-heading">
            <div className="relative overflow-hidden rounded-3xl border border-white/20 bg-clip-padding p-6 shadow-[0_32px_80px_rgba(0,0,0,0.85)] md:p-10">
              <div className="radial-backdrop" />
              <div className="relative z-10">
                <div className="inline-flex items-center rounded-full border border-brand bg-white/5 px-4 py-1 text-[11px] font-medium tracking-[0.22em] text-brand-200/90">
                  {m.display} MARGIN
                </div>
                <h2
                  id="leverage-heading"
                  className="mt-4 text-2xl font-semibold tracking-tight text-slate-50 md:text-[26px]"
                >
                  {m.display} margin requirement by leverage
                </h2>
                <p className="mt-4 text-[15px] leading-relaxed text-slate-200/90">
                  Required margin is the position notional divided by your leverage. The percentage of
                  the notional you must post is the same for every instrument; what differs is the
                  maximum leverage a broker allows on {m.display}.{capNote}
                </p>

                <div className="mt-8 grid gap-3 sm:grid-cols-3">
                  {LEVERAGES.map((lev) => (
                    <div key={lev} className="rounded-2xl border border-white/15 bg-white/5 p-5 backdrop-blur-xl">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.25em] text-brand-300/90">
                        1:{lev}
                      </p>
                      <div className="mt-3 border-t border-white/8 pt-3">
                        <p className="text-[10px] uppercase tracking-[0.2em] text-white/35">Margin of notional</p>
                        <p className="mt-1 text-xl font-semibold text-white">{marginPct(lev)}</p>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="mt-6 rounded-2xl border border-brand/20 bg-brand/5 px-5 py-4 text-[13px] leading-relaxed text-slate-300/90">
                  <span className="font-semibold text-brand-300/90">Notional: </span>
                  {m.contractSize.toLocaleString("en-US")} {m.unitLabel} per 1.00 lot × current price,
                  converted from {m.baseName} into your account currency. The calculator above uses the
                  live rate; enter your lots and leverage to see the exact {m.display} margin.
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
                  {m.display} margin questions
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
                  Margin calculators for other pairs
                </h2>

                <div className="mt-8 flex flex-wrap gap-2">
                  {siblings.map((s) => {
                    const sm = describePair(s);
                    return (
                      <Link
                        key={s}
                        href={`/margincalculator/${sm.slug}`}
                        className="inline-flex items-center rounded-full border border-white/15 bg-white/5 px-4 py-2 text-[13px] text-slate-200/90 transition hover:border-white/25 hover:bg-white/[0.08] hover:text-white"
                      >
                        {sm.display}
                      </Link>
                    );
                  })}
                </div>

                <div className="mt-8 grid gap-4 sm:grid-cols-2">
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
                    href={`/pipvaluecalculator/${m.slug}`}
                    className="group rounded-2xl border border-white/15 bg-white/5 p-5 backdrop-blur-xl transition hover:border-white/20 hover:bg-white/[0.07]"
                  >
                    <p className="text-[11px] font-semibold uppercase tracking-[0.25em] text-brand-300/90">Tool</p>
                    <p className="mt-2 flex items-center gap-2 text-[15px] font-medium text-slate-100 group-hover:text-white">
                      <Gauge className="h-4 w-4" />
                      {m.display} Pip Value Calculator
                    </p>
                    <p className="mt-1 text-[13px] text-slate-400/80">
                      What one pip of {m.display} is worth in your account currency, per lot.
                    </p>
                  </Link>
                </div>

                <div className="mt-4 text-center">
                  <Link
                    href="/margincalculator"
                    className="inline-flex items-center gap-2 text-[13px] text-brand-300/80 transition hover:text-brand-200"
                  >
                    All-pairs margin calculator
                    <ArrowRight className="h-3.5 w-3.5" />
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
