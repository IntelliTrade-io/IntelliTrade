import type { Metadata } from "next";
import { jsonLd } from "@/lib/jsonLd";
import Link from "next/link";
import { Calculator, Scale, TrendingUp, ArrowRight } from "lucide-react";
import PipValueCalculator from "@/components/calculators/PipValueCalculator";
import ScrollRevealSection from "@/components/ui/ScrollRevealSection";
import { LatestFromBlog } from "@/components/blog/LatestFromBlog";
import { describePair } from "@/lib/pair-meta";

const URL = "https://intellitrade.tech/pipvaluecalculator";

// Popular per-pair pip value pages surfaced from the hub for internal linking.
const POPULAR_PAIRS = [
  "EURUSD", "GBPUSD", "USDJPY", "XAUUSD",
  "GBPJPY", "AUDUSD", "USDCAD", "EURJPY",
  "XAGUSD", "BTCUSD", "EURGBP", "NZDUSD",
];

export const metadata: Metadata = {
  title: "Pip Value Calculator | Pip Value for Forex, Gold & Crypto | IntelliTrade",
  description:
    "Calculate the value of one pip in your account currency for any forex pair, gold or crypto, with live exchange rates. Free pip value calculator for standard, mini and micro lots.",
  alternates: { canonical: URL },
  openGraph: {
    title: "Pip Value Calculator | IntelliTrade",
    description:
      "Work out the value of one pip in your account currency for any pair, with live exchange rates. Standard, mini and micro lots.",
    url: URL,
    siteName: "IntelliTrade",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Pip Value Calculator | IntelliTrade",
    description: "Pip value in your account currency for any pair, with live rates.",
  },
};

// ─── FAQ (single source: feeds both the visible accordion and FAQPage schema) ─

const FAQ_ITEMS = [
  {
    question: "What is a pip value calculator?",
    answer:
      "A pip value calculator tells you how much money one pip of price movement is worth for a given position, expressed in your account currency. Pip value depends on the instrument, the size of your position, and the exchange rate between the pair's quote currency and your account currency. Knowing it lets you translate a stop loss in pips into a real money amount before you place a trade.",
  },
  {
    question: "How is pip value calculated?",
    answer:
      "Pip value per standard lot = pip size x contract size x the rate that converts the pair's quote currency into your account currency. For most forex pairs the pip size is 0.0001 and one standard lot is 100,000 units, so a pair quoted in your account currency is worth about 10 units per pip per standard lot. If the quote currency differs from your account currency, the value is converted at the live rate. The figure then scales linearly with position size.",
  },
  {
    question: "What is the pip value of EUR/USD for a USD account?",
    answer:
      "For a USD-denominated account trading EUR/USD, one pip is worth about 10 USD per standard lot (100,000 units), 1 USD per mini lot (0.1), and 0.10 USD per micro lot (0.01). Because the quote currency (USD) matches the account currency, no conversion is applied, so the value is stable regardless of the exchange rate.",
  },
  {
    question: "Why does pip value change with the exchange rate?",
    answer:
      "When the pair's quote currency is different from your account currency, the pip value has to be converted back into your currency at the current rate. As that rate moves, the converted pip value moves with it. For pairs where the quote currency equals your account currency, no conversion is needed and the pip value stays fixed per lot.",
  },
  {
    question: "What is the difference between a standard, mini and micro lot?",
    answer:
      "A standard lot is 100,000 units of the base currency, a mini lot is 10,000 units (0.1 lot), and a micro lot is 1,000 units (0.01 lot). Pip value scales directly with lot size, so a mini lot is worth one tenth of a standard lot per pip and a micro lot one hundredth. This calculator shows all three alongside the value for your exact position.",
  },
  {
    question: "Is pip value the same for gold and crypto?",
    answer:
      "No. Metals and crypto use different contract specifications and pip conventions, so their pip values differ from standard forex. This calculator applies gold, silver and crypto contract sizes where relevant, but brokers vary, so always confirm the exact contract specification with your broker before sizing a position.",
  },
];

const softwareAppSchema = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "IntelliTrade Pip Value Calculator",
  applicationCategory: "FinanceApplication",
  operatingSystem: "Web",
  offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
  description:
    "Free pip value calculator for forex, gold and crypto traders. Calculates the value of one pip in your account currency for any position size, using live exchange rates.",
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
    { "@type": "ListItem", position: 2, name: "Pip Value Calculator", item: URL },
  ],
};

const EXAMPLES = [
  {
    title: "EUR/USD · USD account",
    lead: "1 standard lot",
    body: "Pip size 0.0001 x 100,000 units = 10 USD per pip. The quote currency (USD) matches the account, so no conversion is applied: 10 USD standard, 1 USD mini, 0.10 USD micro.",
  },
  {
    title: "USD/JPY · USD account",
    lead: "1 standard lot",
    body: "JPY pairs use a 0.01 pip size. Pip value = 0.01 x 100,000 = 1,000 JPY per pip, converted to USD at the live USD/JPY rate — around 6.70 USD per pip when USD/JPY trades near 150.",
  },
  {
    title: "XAU/USD (gold) · USD account",
    lead: "1 standard lot",
    body: "Gold uses a 100-ounce contract and a 0.01 pip. Pip value = 0.01 x 100 = 1 USD per pip per standard lot. Broker contract sizes vary, so confirm before sizing.",
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
            Pip Value Calculator
          </h1>
          <p className="mt-1 text-[13px] uppercase tracking-[0.18em] text-white/40">
            Pip value for forex, gold &amp; crypto
          </p>
          <p className="mt-3 max-w-xl text-sm leading-relaxed text-white/50 sm:text-base">
            Work out what one pip is worth in your account currency for any pair and position size,
            with live exchange-rate conversion built in. Shows standard, mini and micro lots.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            {["Live exchange rates", "Forex, gold & crypto", "Standard / mini / micro", "Free tool"].map((label) => (
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
            <PipValueCalculator />
          </div>
        </div>

        <p className="mt-4 text-center text-[11px] text-white/28">
          For educational and planning purposes only. Always verify instrument specifications and
          contract details with your broker.
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
                  How pip value is calculated
                </h2>
                <p className="mt-4 text-[15px] leading-relaxed text-slate-200/90">
                  Pip value answers a simple question: if price moves one pip, how much does my
                  position gain or lose? It depends on three things: the instrument&apos;s pip size,
                  the contract size behind one lot, and the exchange rate that brings the pair&apos;s
                  quote currency back into your account currency.
                </p>
                <div className="mt-6 rounded-2xl border border-white/12 bg-white/[0.03] p-5 font-mono text-[13px] leading-relaxed text-white/70">
                  pip value / standard lot = pip size x contract size x (quote &rarr; account rate)
                  <br />
                  pip value = pip value / lot x number of lots
                </div>
                <p className="mt-4 text-[15px] leading-relaxed text-slate-200/90">
                  When the quote currency already matches your account currency, the conversion factor
                  is 1 and the pip value stays fixed per lot. When it differs, the value is converted
                  at the live rate, which is why pip value on cross pairs shifts as the market moves.
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
                  Pip value questions
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

        {/* ── Pip value by pair ────────────────────────────────────────────── */}
        <ScrollRevealSection className="mt-8">
          <section aria-labelledby="by-pair-heading">
            <div className="relative overflow-hidden rounded-3xl border border-white/20 bg-clip-padding p-6 shadow-[0_32px_80px_rgba(0,0,0,0.85)] md:p-10">
              <div className="radial-backdrop" />
              <div className="relative z-10">
                <div className="inline-flex items-center rounded-full border border-brand bg-white/5 px-4 py-1 text-[11px] font-medium tracking-[0.22em] text-brand-200/90">
                  BY PAIR
                </div>
                <h2 id="by-pair-heading" className="mt-4 text-2xl font-semibold tracking-tight text-slate-50 md:text-[26px]">
                  Pip value calculator by pair
                </h2>
                <p className="mt-4 text-[15px] leading-relaxed text-slate-200/90">
                  Jump to a pip value calculator pre-set to a specific instrument, each with its own
                  pip size, contract specification and per-lot values.
                </p>
                <div className="mt-8 flex flex-wrap gap-2">
                  {POPULAR_PAIRS.map((symbol) => {
                    const m = describePair(symbol);
                    return (
                      <Link
                        key={symbol}
                        href={`/pipvaluecalculator/${m.slug}`}
                        className="inline-flex items-center rounded-full border border-white/15 bg-white/5 px-4 py-2 text-[13px] text-slate-200/90 transition hover:border-white/25 hover:bg-white/[0.08] hover:text-white"
                      >
                        {m.display}
                      </Link>
                    );
                  })}
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

        <LatestFromBlog />
      </div>
    </>
  );
}
