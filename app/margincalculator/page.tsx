import type { Metadata } from "next";
import { jsonLd } from "@/lib/jsonLd";
import Link from "next/link";
import { Calculator, Gauge, TrendingUp, ArrowRight } from "lucide-react";
import MarginCalculator from "@/components/calculators/MarginCalculator";
import ScrollRevealSection from "@/components/ui/ScrollRevealSection";
import { LatestFromBlog } from "@/components/blog/LatestFromBlog";
import { describePair } from "@/lib/pair-meta";

const URL = "https://intellitrade.tech/margincalculator";

// Popular per-pair margin pages surfaced from the hub for internal linking.
const POPULAR_PAIRS = [
  "EURUSD", "GBPUSD", "USDJPY", "XAUUSD",
  "GBPJPY", "AUDUSD", "USDCAD", "EURJPY",
  "XAGUSD", "BTCUSD", "EURGBP", "NZDUSD",
];

export const metadata: Metadata = {
  title: "Margin Calculator | Forex Leverage & Required Margin | IntelliTrade",
  description:
    "Calculate the margin required to open a leveraged position for any forex pair, gold or crypto, with live exchange rates. Free margin and leverage calculator.",
  alternates: { canonical: URL },
  openGraph: {
    title: "Margin Calculator | IntelliTrade",
    description:
      "Work out the margin required to open a leveraged position, with live exchange rates. Any pair, any leverage.",
    url: URL,
    siteName: "IntelliTrade",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Margin Calculator | IntelliTrade",
    description: "Required margin for a leveraged position, with live rates.",
  },
};

const FAQ_ITEMS = [
  {
    question: "What is a margin calculator?",
    answer:
      "A margin calculator tells you how much of your own capital a broker will set aside to open a leveraged position, expressed in your account currency. It depends on the instrument, your position size, the current price, and your account leverage. Knowing required margin before you trade helps you avoid over-committing capital and getting close to a margin call.",
  },
  {
    question: "How is required margin calculated?",
    answer:
      "Required margin = position notional value / leverage. The notional value is your position size in base-currency units (lots x contract size) valued at the current price and converted into your account currency. For example, one standard lot of EUR/USD is 100,000 EUR; at 1.08 that is 108,000 USD of notional, and at 1:30 leverage the required margin is 108,000 / 30 = 3,600 USD.",
  },
  {
    question: "What does leverage like 1:30 or 1:100 mean?",
    answer:
      "Leverage expresses how much market exposure you control per unit of margin. At 1:30, every 1 unit of margin supports 30 units of position value, so the margin requirement is 1/30 (about 3.33%) of the notional. Higher leverage lowers the margin needed to open the same position, but it does not change the position's risk: losses are still measured against the full notional.",
  },
  {
    question: "Does higher leverage reduce my risk?",
    answer:
      "No. Higher leverage only reduces the margin required to open a position; it does not reduce the money at risk. A larger position relative to your account still loses (or gains) the same amount per pip regardless of leverage. Position sizing and stop-loss distance determine risk, which is what the lot size calculator is for. Leverage determines how much margin that position ties up.",
  },
  {
    question: "Why does required margin change with the exchange rate?",
    answer:
      "The notional value of your position is measured in the base currency and then converted into your account currency at the live rate. When that rate moves, the account-currency value of the same position moves with it, so the margin requirement shifts. When the base currency equals your account currency, no conversion applies and margin stays fixed for a given size and leverage.",
  },
  {
    question: "Is margin the same for gold and crypto?",
    answer:
      "No. Metals and crypto use different contract sizes and often different maximum leverage than forex, so their margin requirements differ. This calculator applies the relevant contract sizes, but brokers vary and many cap leverage per instrument, so always confirm the exact contract specification and leverage limits with your broker.",
  },
];

const softwareAppSchema = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "IntelliTrade Margin Calculator",
  applicationCategory: "FinanceApplication",
  operatingSystem: "Web",
  offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
  description:
    "Free margin and leverage calculator for forex, gold and crypto traders. Calculates the margin required to open a leveraged position in your account currency, using live exchange rates.",
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
    { "@type": "ListItem", position: 2, name: "Margin Calculator", item: URL },
  ],
};

const EXAMPLES = [
  {
    title: "EUR/USD · USD account",
    lead: "1 lot @ 1:30",
    body: "Notional = 100,000 EUR valued at 1.08 = 108,000 USD. Required margin = 108,000 / 30 = 3,600 USD (about 3.33% of the position).",
  },
  {
    title: "EUR/USD · USD account",
    lead: "1 lot @ 1:100",
    body: "Same 108,000 USD notional, higher leverage: margin = 108,000 / 100 = 1,080 USD. The position — and its risk — is identical; only the margin tied up is lower.",
  },
  {
    title: "XAU/USD (gold) · USD account",
    lead: "1 lot @ 1:20",
    body: "Gold uses a 100-ounce contract. Notional = 100 x 2,400 = 240,000 USD; margin = 240,000 / 20 = 12,000 USD. Broker leverage caps on metals vary.",
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
            Margin Calculator
          </h1>
          <p className="mt-1 text-[13px] uppercase tracking-[0.18em] text-white/40">
            Required margin &amp; leverage for forex, gold &amp; crypto
          </p>
          <p className="mt-3 max-w-xl text-sm leading-relaxed text-white/50 sm:text-base">
            Work out the margin needed to open a leveraged position in your account currency, with
            live exchange-rate conversion built in. Enter your pair, position size and leverage.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            {["Live exchange rates", "Forex, gold & crypto", "Any leverage", "Free tool"].map((label) => (
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
            <MarginCalculator />
          </div>
        </div>

        <p className="mt-4 text-center text-[11px] text-white/28">
          For educational and planning purposes only. Always verify instrument specifications,
          contract details and leverage limits with your broker.
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
                  How required margin is calculated
                </h2>
                <p className="mt-4 text-[15px] leading-relaxed text-slate-200/90">
                  Margin is the slice of your own capital a broker locks up to let you hold a
                  leveraged position. It is the position&apos;s notional value divided by your
                  leverage, expressed in your account currency.
                </p>
                <div className="mt-6 rounded-2xl border border-white/12 bg-white/[0.03] p-5 font-mono text-[13px] leading-relaxed text-white/70">
                  notional = lots x contract size x (base &rarr; account rate)
                  <br />
                  required margin = notional / leverage
                </div>
                <p className="mt-4 text-[15px] leading-relaxed text-slate-200/90">
                  Higher leverage lowers the margin needed for the same position, but not the risk:
                  profit and loss are always measured against the full notional. Use the lot size
                  calculator to size risk, and this calculator to see the margin that position ties up.
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
                    <div key={`${title}-${lead}`} className="rounded-2xl border border-white/15 bg-white/5 p-5 backdrop-blur-xl">
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
                  Margin &amp; leverage questions
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

        {/* ── Margin by pair ───────────────────────────────────────────────── */}
        <ScrollRevealSection className="mt-8">
          <section aria-labelledby="by-pair-heading">
            <div className="relative overflow-hidden rounded-3xl border border-white/20 bg-clip-padding p-6 shadow-[0_32px_80px_rgba(0,0,0,0.85)] md:p-10">
              <div className="radial-backdrop" />
              <div className="relative z-10">
                <div className="inline-flex items-center rounded-full border border-brand bg-white/5 px-4 py-1 text-[11px] font-medium tracking-[0.22em] text-brand-200/90">
                  BY PAIR
                </div>
                <h2 id="by-pair-heading" className="mt-4 text-2xl font-semibold tracking-tight text-slate-50 md:text-[26px]">
                  Margin calculator by pair
                </h2>
                <p className="mt-4 text-[15px] leading-relaxed text-slate-200/90">
                  Jump to a margin calculator pre-set to a specific instrument, each with its own
                  contract specification and margin-by-leverage reference.
                </p>
                <div className="mt-8 flex flex-wrap gap-2">
                  {POPULAR_PAIRS.map((symbol) => {
                    const m = describePair(symbol);
                    return (
                      <Link
                        key={symbol}
                        href={`/margincalculator/${m.slug}`}
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

        <LatestFromBlog />
      </div>
    </>
  );
}
