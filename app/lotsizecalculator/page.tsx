import type { Metadata } from "next";
import Link from "next/link";
import { BookOpen, ArrowRight } from "lucide-react";
import LotSizeCalculator from "@/components/lot-size-calculator-2";
import ScrollRevealSection from "@/components/scroll-reveal-section";

export const metadata: Metadata = {
  title: "Lot Size Calculator | Position Size Calculator for Forex, Gold & Indices | IntelliTrade",
  description:
    "Calculate the correct lot size based on your account balance, risk percentage, stop loss and live exchange rates. Free position size calculator for forex, gold and indices.",
  alternates: {
    canonical: "https://intellitrade.tech/lotsizecalculator",
  },
};

// ─── Structured data ──────────────────────────────────────────────────────────

const softwareAppSchema = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "IntelliTrade Lot Size Calculator",
  applicationCategory: "FinanceApplication",
  operatingSystem: "Web",
  offers: {
    "@type": "Offer",
    price: "0",
    priceCurrency: "USD",
  },
  description:
    "Free position size calculator for forex, gold and index traders. Determines the correct lot size based on account balance, risk percentage, stop loss distance, and live exchange rates.",
  url: "https://intellitrade.tech/lotsizecalculator",
};

const faqSchemaData = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: [
    {
      "@type": "Question",
      name: "What is a lot size calculator?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "A lot size calculator determines the correct position size (in lots) based on your account balance, risk per trade percentage, and stop loss distance. It removes guesswork from position sizing by calculating exactly how many lots to trade so that if your stop loss is hit, you lose only the amount you defined as acceptable risk. Most trading accounts do not fail because of one bad trade — they fail because of normal losses combined with oversized positions. A lot size calculator prevents that by keeping every trade sized consistently.",
      },
    },
    {
      "@type": "Question",
      name: "How do I use this position size calculator?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Select your account currency, choose the pair or instrument you want to trade, enter your account balance, enter your risk per trade as a percentage (e.g. 1%), and enter your stop loss distance in pips. The calculator returns your position size in lots, the risk amount in your account currency, and the pip value per lot.",
      },
    },
    {
      "@type": "Question",
      name: "How is lot size calculated?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "The calculation follows three steps. First: Risk Amount = Account Balance × Risk %. Second: the stop loss distance is converted into money using the instrument's pip value — if the instrument quotes in a different currency than your account, the pip value is converted to your account currency using live rates. Third: Position Size (lots) = Risk Amount ÷ (Stop Loss in pips × Pip Value per 1.00 lot).",
      },
    },
    {
      "@type": "Question",
      name: "Does this calculator work for forex, gold and indices?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Yes. The calculator supports FX majors, crosses, gold (XAUUSD), silver (XAGUSD), and other instruments. 1 lot of XAUUSD = 100 troy ounces, 1 lot of a standard FX pair = 100,000 units. The logic works for any instrument if you know the pip or tick size and the contract specification. Always verify contract size with your broker.",
      },
    },
    {
      "@type": "Question",
      name: "What happens if my account currency differs from the quote currency?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "The calculator handles currency conversion automatically using live exchange rates. When your account currency differs from the instrument's quote currency, the pip value is first calculated in the quote currency and then converted to your account currency. A pip value can change when your account currency changes, making a trade appear larger or smaller due to conversion alone.",
      },
    },
    {
      "@type": "Question",
      name: "What is the difference between a micro, mini, and standard lot?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "In forex, 1.00 standard lot = 100,000 units of base currency, 0.10 is a mini lot (10,000 units), and 0.01 is a micro lot (1,000 units). Metals and indices follow different contract definitions — for example, 1 lot of gold (XAUUSD) is typically 100 troy ounces. Always check your broker's instrument specifications.",
      },
    },
    {
      "@type": "Question",
      name: "Can I use this calculator with prop firm rules?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Yes. Prop rules are usually based on daily drawdown and maximum loss. Position sizing helps you translate those limits into a consistent per-trade risk. By setting your risk % to stay within the prop firm's allowed parameters, you can size every trade accordingly.",
      },
    },
    {
      "@type": "Question",
      name: "What risk percentage do most traders use?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "There is no universal best number. Many traders operate somewhere between 0.25% and 2% depending on strategy, volatility, and objectives. Focus on survivability first: smaller risk generally reduces drawdowns and makes losing streaks easier to tolerate.",
      },
    },
  ],
};

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function Page() {
  return (
    <>
      {/* Structured data */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(softwareAppSchema) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchemaData) }}
      />

      <div className="mx-auto max-w-4xl px-4 pb-28 pt-10 sm:px-8">

        {/* ── Hero ─────────────────────────────────────────────────────────── */}
        <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="inline-flex items-center rounded-full border border-white/12 bg-white/[0.03] px-4 py-2 text-[11px] font-medium uppercase tracking-[0.28em] text-white/72">
              IntelliTrade tools
            </div>
            <h1 className="mt-4 text-3xl font-semibold tracking-tight text-white sm:text-4xl">
              Lot Size Calculator
            </h1>
            <p className="mt-1 text-[13px] uppercase tracking-[0.18em] text-white/40">
              Position size calculator for forex, gold &amp; indices
            </p>
            <p className="mt-3 max-w-xl text-sm leading-relaxed text-white/50 sm:text-base">
              Use this free lot size calculator to determine the correct position size based on your
              account balance, risk per trade, stop loss distance, and account currency — with live
              exchange rate conversion built in.
            </p>

            {/* Trust pills */}
            <div className="mt-4 flex flex-wrap gap-2">
              {["Live exchange rates", "Forex, gold & indices", "Risk-based sizing", "Free tool"].map(
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
            className="inline-flex shrink-0 items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-5 py-2.5 text-sm text-white/70 transition-all hover:border-white/18 hover:text-white"
          >
            <BookOpen className="h-4 w-4" />
            Guide &amp; FAQ
          </Link>
        </div>

        {/* ── Calculator card ───────────────────────────────────────────────── */}
        <div className="relative overflow-hidden rounded-3xl border border-white/20 bg-clip-padding p-6 shadow-[0_32px_80px_rgba(0,0,0,0.85)] md:p-10">
          <div className="radial-backdrop" />
          <div className="relative z-10">
            <LotSizeCalculator />
          </div>
        </div>

        {/* Trust note */}
        <p className="mt-4 text-center text-[11px] text-white/28">
          For educational and planning purposes only. Always verify instrument specifications and
          contract details with your broker.
        </p>

        {/* ── How it works ─────────────────────────────────────────────────── */}
        <ScrollRevealSection className="mt-20">
          <section aria-labelledby="how-it-works-heading">
            <div className="relative overflow-hidden rounded-3xl border border-white/20 bg-clip-padding p-6 shadow-[0_32px_80px_rgba(0,0,0,0.85)] md:p-10">
              <div className="radial-backdrop" />
              <div className="relative z-10">
                <div className="inline-flex items-center rounded-full border border-brand bg-white/5 px-4 py-1 text-[11px] font-medium tracking-[0.22em] text-brand-200/90">
                  SECTION 01
                </div>
                <h2
                  id="how-it-works-heading"
                  className="mt-4 text-2xl font-semibold tracking-tight text-slate-50 md:text-[26px]"
                >
                  How the lot size calculator works
                </h2>
                <p className="mt-4 text-[15px] leading-relaxed text-slate-200/90">
                  The calculator follows a simple idea: define the money you are willing to lose on
                  the trade, then solve for the position size that matches that risk if the stop loss
                  is hit. It uses your account balance, risk percentage, stop loss distance, and
                  instrument context — including live currency conversion where needed.
                </p>

                <div className="mt-8 grid gap-4 sm:grid-cols-2">
                  {[
                    {
                      step: "Step 1",
                      title: "Enter your account balance and currency",
                      desc: "Your account balance and currency anchor the entire calculation. Every other output is expressed relative to these values.",
                    },
                    {
                      step: "Step 2",
                      title: "Select the pair or instrument",
                      desc: "The calculator loads the correct pip size and contract specification for your selected instrument — forex, gold, silver, or crypto.",
                    },
                    {
                      step: "Step 3",
                      title: "Enter your risk per trade and stop loss",
                      desc: "Risk per trade is a percentage of your balance (e.g. 1%). Stop loss distance is in pips. Together these define how much money is at risk.",
                    },
                    {
                      step: "Step 4",
                      title: "Get your position size",
                      desc: "The calculator returns your position size in lots, the risk amount in your account currency, and the pip value per lot — using live conversion logic where needed.",
                    },
                  ].map(({ step, title, desc }) => (
                    <div
                      key={step}
                      className="rounded-2xl border border-white/15 bg-white/5 p-5 backdrop-blur-xl"
                    >
                      <p className="text-[11px] font-semibold uppercase tracking-[0.25em] text-brand-300/90">
                        {step}
                      </p>
                      <p className="mt-2 text-[14px] font-medium text-slate-100">{title}</p>
                      <p className="mt-1 text-[13px] leading-relaxed text-slate-300/80">{desc}</p>
                    </div>
                  ))}
                </div>

                <div className="mt-6 rounded-2xl border border-brand/20 bg-brand/5 px-5 py-4 text-[13px] leading-relaxed text-slate-300/90">
                  <span className="font-semibold text-brand-300/90">Formula: </span>
                  Position Size (lots) = Risk Amount ÷ (Stop Loss in pips × Pip Value per 1.00 lot)
                </div>
              </div>
            </div>
          </section>
        </ScrollRevealSection>

        {/* ── Examples ─────────────────────────────────────────────────────── */}
        <ScrollRevealSection className="mt-10" delay={0.04}>
          <section aria-labelledby="examples-heading">
            <div className="relative overflow-hidden rounded-3xl border border-white/20 bg-clip-padding p-6 shadow-[0_32px_80px_rgba(0,0,0,0.85)] md:p-10">
              <div className="radial-backdrop" />
              <div className="relative z-10">
                <div className="inline-flex items-center rounded-full border border-brand bg-white/5 px-4 py-1 text-[11px] font-medium tracking-[0.22em] text-brand-200/90">
                  SECTION 02
                </div>
                <h2
                  id="examples-heading"
                  className="mt-4 text-2xl font-semibold tracking-tight text-slate-50 md:text-[26px]"
                >
                  Lot size calculator examples
                </h2>
                <p className="mt-4 text-[15px] leading-relaxed text-slate-200/90">
                  The examples below use the same formula the calculator applies. They illustrate
                  how different instruments, currencies, and stop distances change the resulting lot
                  size.
                </p>

                <div className="mt-8 grid gap-4 sm:grid-cols-3">
                  {/* Example 1 — EURUSD */}
                  <div className="rounded-2xl border border-white/15 bg-white/5 p-5 backdrop-blur-xl">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.25em] text-brand-300/90">
                      Example 1 — EURUSD
                    </p>
                    <dl className="mt-4 space-y-1.5 text-[12px]">
                      <div className="flex justify-between">
                        <dt className="text-slate-400">Balance</dt>
                        <dd className="text-slate-100">$5,000</dd>
                      </div>
                      <div className="flex justify-between">
                        <dt className="text-slate-400">Risk</dt>
                        <dd className="text-slate-100">1% ($50)</dd>
                      </div>
                      <div className="flex justify-between">
                        <dt className="text-slate-400">Stop loss</dt>
                        <dd className="text-slate-100">30 pips</dd>
                      </div>
                    </dl>
                    <div className="mt-4 border-t border-white/8 pt-4">
                      <p className="text-[10px] uppercase tracking-[0.2em] text-white/35">Result</p>
                      <p className="mt-1 text-xl font-semibold text-white">0.17 lots</p>
                    </div>
                    <p className="mt-3 text-[12px] leading-relaxed text-slate-400/80">
                      EURUSD pip value ≈ $10/pip/lot. Risk per lot with 30-pip stop = 30 × $10 =
                      $300. Position size = $50 ÷ $300 = 0.17 lots.
                    </p>
                  </div>

                  {/* Example 2 — GBPJPY */}
                  <div className="rounded-2xl border border-white/15 bg-white/5 p-5 backdrop-blur-xl">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.25em] text-brand-300/90">
                      Example 2 — GBPJPY
                    </p>
                    <dl className="mt-4 space-y-1.5 text-[12px]">
                      <div className="flex justify-between">
                        <dt className="text-slate-400">Balance</dt>
                        <dd className="text-slate-100">$5,000</dd>
                      </div>
                      <div className="flex justify-between">
                        <dt className="text-slate-400">Risk</dt>
                        <dd className="text-slate-100">1% ($50)</dd>
                      </div>
                      <div className="flex justify-between">
                        <dt className="text-slate-400">Stop loss</dt>
                        <dd className="text-slate-100">30 pips</dd>
                      </div>
                    </dl>
                    <div className="mt-4 border-t border-white/8 pt-4">
                      <p className="text-[10px] uppercase tracking-[0.2em] text-white/35">Result</p>
                      <p className="mt-1 text-xl font-semibold text-white">≈ 0.25 lots</p>
                    </div>
                    <p className="mt-3 text-[12px] leading-relaxed text-slate-400/80">
                      With USDJPY at 150, pip value per lot in USD ≈ 1,000 ÷ 150 = $6.67. Risk per
                      lot = 30 × $6.67 = $200. Position size ≈ $50 ÷ $200 ≈ 0.25 lots.
                    </p>
                  </div>

                  {/* Example 3 — Gold XAUUSD */}
                  <div className="rounded-2xl border border-white/15 bg-white/5 p-5 backdrop-blur-xl">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.25em] text-brand-300/90">
                      Example 3 — Gold (XAUUSD)
                    </p>
                    <dl className="mt-4 space-y-1.5 text-[12px]">
                      <div className="flex justify-between">
                        <dt className="text-slate-400">Balance</dt>
                        <dd className="text-slate-100">$10,000</dd>
                      </div>
                      <div className="flex justify-between">
                        <dt className="text-slate-400">Risk</dt>
                        <dd className="text-slate-100">1% ($100)</dd>
                      </div>
                      <div className="flex justify-between">
                        <dt className="text-slate-400">Stop loss</dt>
                        <dd className="text-slate-100">200 pips ($2.00)</dd>
                      </div>
                    </dl>
                    <div className="mt-4 border-t border-white/8 pt-4">
                      <p className="text-[10px] uppercase tracking-[0.2em] text-white/35">Result</p>
                      <p className="mt-1 text-xl font-semibold text-white">0.50 lots</p>
                    </div>
                    <p className="mt-3 text-[12px] leading-relaxed text-slate-400/80">
                      Gold: 1 lot = 100 oz, pip = $0.01. Pip value/lot = $1.00. Risk per lot with
                      200-pip stop = $200. Position size = $100 ÷ $200 = 0.50 lots (50 oz).
                    </p>
                  </div>
                </div>

                <div className="mt-6 rounded-2xl border border-brand/20 bg-brand/5 px-5 py-4 text-[13px] leading-relaxed text-slate-300/90">
                  <span className="font-semibold text-brand-300/90">Note on gold: </span>
                  Many platforms quote gold to 2 decimals — 1 pip = $0.01. A $2.00 stop is 200 pips.
                  A $20.00 stop is 2,000 pips. If your platform shows open and stop price, the stop
                  distance is simply the price difference.
                </div>
              </div>
            </div>
          </section>
        </ScrollRevealSection>

        {/* ── Common mistakes ───────────────────────────────────────────────── */}
        <ScrollRevealSection className="mt-10" delay={0.04}>
          <section aria-labelledby="mistakes-heading">
            <div className="relative overflow-hidden rounded-3xl border border-white/20 bg-clip-padding p-6 shadow-[0_32px_80px_rgba(0,0,0,0.85)] md:p-10">
              <div className="radial-backdrop" />
              <div className="relative z-10">
                <div className="inline-flex items-center rounded-full border border-brand bg-white/5 px-4 py-1 text-[11px] font-medium tracking-[0.22em] text-brand-200/90">
                  SECTION 03
                </div>
                <h2
                  id="mistakes-heading"
                  className="mt-4 text-2xl font-semibold tracking-tight text-slate-50 md:text-[26px]"
                >
                  Common position sizing mistakes
                </h2>
                <p className="mt-4 text-[15px] leading-relaxed text-slate-200/90">
                  Most sizing errors come down to a few repeatable mistakes. Knowing them upfront
                  saves you from results that look wrong even when the formula is right.
                </p>

                <div className="mt-8 grid gap-4 md:grid-cols-2">
                  {[
                    {
                      title: "Mixing pip and price stops",
                      desc: "Some tools take a stop loss in pips, others take an open price and stop price. Make sure you are comparing the same stop distance.",
                    },
                    {
                      title: "JPY pip convention",
                      desc: "JPY pairs use a pip size of 0.01, not 0.0001. A 30-pip stop on GBPJPY is a 0.30 move in price.",
                    },
                    {
                      title: "Contract size differences",
                      desc: "Some brokers use gold contracts of 100 oz per lot, others use 10 oz or 1 oz. The same lot size can represent a different exposure depending on the broker.",
                    },
                    {
                      title: "Deposit currency conversion",
                      desc: "A pip value can change when your account currency changes. The trade might look larger or smaller only because of currency conversion.",
                    },
                    {
                      title: "Confusing micro, mini, and standard lots",
                      desc: "In FX, 1.00 standard lot is 100,000 units, 0.10 is a mini lot, 0.01 is a micro lot. Metals and indices follow different contract definitions.",
                    },
                    {
                      title: "Using fixed lot sizes instead of risk-based sizing",
                      desc: "A fixed lot size ignores your account size and stop loss distance. Two trades with the same lot size but different stops carry completely different risk amounts.",
                    },
                  ].map(({ title, desc }) => (
                    <div
                      key={title}
                      className="rounded-2xl border border-white/15 bg-white/5 p-5 backdrop-blur-xl"
                    >
                      <p className="text-[11px] font-semibold uppercase tracking-[0.25em] text-brand-300/90">
                        {title}
                      </p>
                      <p className="mt-2 text-[14px] leading-relaxed text-slate-200/90">{desc}</p>
                    </div>
                  ))}
                </div>

                <div className="mt-6 rounded-2xl border border-brand/20 bg-brand/5 px-5 py-4 text-[13px] leading-relaxed text-slate-300/90">
                  <span className="font-semibold text-brand-300/90">Tip: </span>
                  If a result looks too big or too small, check only two things first: (1) contract
                  size, and (2) what the tool means by pip or tick.
                </div>
              </div>
            </div>
          </section>
        </ScrollRevealSection>

        {/* ── FAQ ──────────────────────────────────────────────────────────── */}
        <ScrollRevealSection className="mt-10" delay={0.04}>
          <section aria-labelledby="faq-heading">
            <div className="relative overflow-hidden rounded-3xl border border-white/20 bg-clip-padding p-6 shadow-[0_32px_80px_rgba(0,0,0,0.85)] md:p-10">
              <div className="radial-backdrop" />
              <div className="relative z-10">
                <div className="inline-flex items-center rounded-full border border-brand bg-white/5 px-4 py-1 text-[11px] font-medium tracking-[0.22em] text-brand-200/90">
                  SECTION 04
                </div>
                <h2
                  id="faq-heading"
                  className="mt-4 text-2xl font-semibold tracking-tight text-slate-50 md:text-[26px]"
                >
                  Lot size calculator FAQs
                </h2>

                <div className="mt-8 space-y-3">
                  {[
                    {
                      q: "What is a lot size calculator?",
                      a: "A lot size calculator determines the correct position size (in lots) based on your account balance, risk per trade percentage, and stop loss distance. It removes guesswork from position sizing by calculating exactly how many lots to trade so that if your stop loss is hit, you lose only the amount you defined as acceptable risk. Most trading accounts do not fail because of one bad trade — they fail because of normal losses combined with oversized positions. A lot size calculator prevents that by keeping every trade sized consistently.",
                    },
                    {
                      q: "How do I use this position size calculator?",
                      a: "Select your account currency. Choose the pair or instrument you want to trade. Enter your account balance. Enter your risk per trade as a percentage (e.g. 1%). Enter your stop loss distance in pips. The calculator returns your position size in lots, the risk amount in your account currency, and the pip value per lot.",
                    },
                    {
                      q: "How is lot size calculated?",
                      a: "The calculation follows three steps. Step 1 — Risk Amount: Account Balance × Risk % = the maximum you are willing to lose on this trade. Step 2 — Pip Value: convert your stop loss distance into money using the instrument's pip value. If the instrument is quoted in a different currency than your account, the pip value is converted into your deposit currency first. Step 3 — Position Size: Position Size (lots) = Risk Amount ÷ (Stop Loss in pips × Pip Value per 1.00 lot).",
                    },
                    {
                      q: "Does this calculator work for forex, gold and indices?",
                      a: "Yes. The logic works for any instrument if you know the tick or pip size and the contract specification (what 1 lot represents). The calculator supports FX majors, crosses, gold (XAUUSD), silver (XAGUSD), and other instruments. Some brokers define metals, indices, and crypto contracts differently, so always sanity-check contract size with your broker.",
                    },
                    {
                      q: "What happens if my account currency differs from the quote currency?",
                      a: "The calculator handles currency conversion automatically using live exchange rates. When your account currency differs from the instrument's quote currency, the pip value is first calculated in the quote currency and then converted to your account currency. A pip value can change when your account currency changes, making a trade appear larger or smaller due to conversion alone.",
                    },
                    {
                      q: "What is the difference between a micro, mini, and standard lot?",
                      a: "In FX, 1.00 standard lot is 100,000 units, 0.10 is a mini lot (10,000 units), and 0.01 is a micro lot (1,000 units). Metals and indices follow different contract definitions — for example, 1 lot of gold (XAUUSD) is typically 100 troy ounces, not 100,000 units. Always check your broker's instrument specifications.",
                    },
                    {
                      q: "Can I use this calculator with prop firm rules?",
                      a: "Yes. Prop rules are usually based on daily drawdown and maximum loss. Position sizing helps you translate those limits into a consistent per-trade risk. By setting your risk % to stay within the prop firm's allowed parameters, you can use this calculator to size every trade accordingly.",
                    },
                    {
                      q: "What risk percentage do most traders use?",
                      a: "There is no universal best number. Many traders operate somewhere between 0.25% and 2% depending on strategy, volatility, and objectives. Focus on survivability first: smaller risk generally reduces drawdowns and makes losing streaks easier to tolerate without taking you out of the game.",
                    },
                  ].map(({ q, a }) => (
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
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M19 9l-7 7-7-7"
                          />
                        </svg>
                      </summary>
                      <div className="px-5 pb-5 text-[14px] leading-relaxed text-slate-200/80">
                        {a}
                      </div>
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

        {/* ── Related links ────────────────────────────────────────────────── */}
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
                  Related IntelliTrade tools &amp; guides
                </h2>

                <div className="mt-8 grid gap-4 sm:grid-cols-2">
                  <Link
                    href="/lotsizecalculator/faq"
                    className="group rounded-2xl border border-white/15 bg-white/5 p-5 backdrop-blur-xl transition hover:border-white/20 hover:bg-white/[0.07]"
                  >
                    <p className="text-[11px] font-semibold uppercase tracking-[0.25em] text-brand-300/90">
                      Guide
                    </p>
                    <p className="mt-2 text-[15px] font-medium text-slate-100 group-hover:text-white">
                      Read the full lot size calculator guide
                    </p>
                    <p className="mt-1 text-[13px] text-slate-400/80">
                      Deep-dive into position sizing fundamentals, worked examples, metals, common
                      mistakes, and more.
                    </p>
                  </Link>

                  <Link
                    href="/gold-price-today"
                    className="group rounded-2xl border border-white/15 bg-white/5 p-5 backdrop-blur-xl transition hover:border-white/20 hover:bg-white/[0.07]"
                  >
                    <p className="text-[11px] font-semibold uppercase tracking-[0.25em] text-brand-300/90">
                      Tool
                    </p>
                    <p className="mt-2 text-[15px] font-medium text-slate-100 group-hover:text-white">
                      Explore Gold Price Today
                    </p>
                    <p className="mt-1 text-[13px] text-slate-400/80">
                      Live gold spot price, historical data, and key levels for XAUUSD traders.
                    </p>
                  </Link>

                  <Link
                    href="/blog"
                    className="group rounded-2xl border border-white/15 bg-white/5 p-5 backdrop-blur-xl transition hover:border-white/20 hover:bg-white/[0.07]"
                  >
                    <p className="text-[11px] font-semibold uppercase tracking-[0.25em] text-brand-300/90">
                      Analysis
                    </p>
                    <p className="mt-2 text-[15px] font-medium text-slate-100 group-hover:text-white">
                      See the latest market analysis
                    </p>
                    <p className="mt-1 text-[13px] text-slate-400/80">
                      Fundamental analysis and daily forex market updates from IntelliTrade.
                    </p>
                  </Link>

                  <Link
                    href="/terms"
                    className="group rounded-2xl border border-white/15 bg-white/5 p-5 backdrop-blur-xl transition hover:border-white/20 hover:bg-white/[0.07]"
                  >
                    <p className="text-[11px] font-semibold uppercase tracking-[0.25em] text-brand-300/90">
                      Legal
                    </p>
                    <p className="mt-2 text-[15px] font-medium text-slate-100 group-hover:text-white">
                      Terms and disclaimers
                    </p>
                    <p className="mt-1 text-[13px] text-slate-400/80">
                      Full legal disclaimer. This is an educational resource only, not investment
                      advice.
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
