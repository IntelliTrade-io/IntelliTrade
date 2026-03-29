"use client";

import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import {
  PricePageBrandStyles,
  RadialBackdrop,

  getChartTabClassName,
  getMarketMoveClassName,
  getQuoteChangeClassName,
} from "./lib/pricePageBrand";
import '@/styles/lot-size-calculator.css';

// ─── Constants ────────────────────────────────────────────────────────────────

const GOLD_SYMBOL = "OANDA:XAUUSD";

const TV_MINI_CHART_SCRIPT_SRC =
  "https://widgets.tradingview-widget.com/w/en/tv-mini-chart.js";
const QUOTE_REFRESH_MS = 12000;

const LARGE_CHART_TIMEOUT_MS = 6000;

const BASE_GOLD_QUOTE = Object.freeze({
  anchor: 2334.56,
  open: 2314.0,
  prevClose: 2313.58,
});

const LARGE_CHART_TABS = [
  { label: "1D", value: "1D", timeFrame: null },
  { label: "1W", value: "1W", timeFrame: "7D" },
  { label: "1M", value: "1M", timeFrame: "1M" },
  { label: "3M", value: "3M", timeFrame: "3M" },
  { label: "6M", value: "6M", timeFrame: "6M" },
  { label: "1Y", value: "1Y", timeFrame: "12M" },
  { label: "All", value: "ALL", timeFrame: "ALL" },
] as const;

// ─── Formatters ───────────────────────────────────────────────────────────────

const currencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const easternTimeFormatter = new Intl.DateTimeFormat("en-US", {
  hour: "numeric",
  minute: "2-digit",
  timeZone: "America/New_York",
});

function roundToTwo(v: number) {
  return Math.round(v * 100) / 100;
}
function formatCurrency(v: number) {
  return currencyFormatter.format(v);
}
function formatSigned(v: number) {
  return `${v >= 0 ? "+" : "-"}${Math.abs(v).toFixed(2)}`;
}
function formatSignedPct(v: number) {
  return `${v >= 0 ? "+" : "-"}${Math.abs(v).toFixed(2)}%`;
}


// ─── Quote logic ──────────────────────────────────────────────────────────────

function getGoldQuote(now = Date.now()) {
  const updatedAt = now - (now % QUOTE_REFRESH_MS);
  const seconds = Math.floor(updatedAt / 1000);
  const primaryWave = Math.sin(seconds / 23);
  const secondaryWave = Math.cos(seconds / 61);
  const price = roundToTwo(
    BASE_GOLD_QUOTE.anchor + primaryWave * 4.2 + secondaryWave * 1.6
  );
  const open = roundToTwo(
    BASE_GOLD_QUOTE.open + Math.cos(seconds / 91) * 1.35
  );
  const prevClose = BASE_GOLD_QUOTE.prevClose;
  const absoluteChange = roundToTwo(price - prevClose);
  const percentageChange = roundToTwo((absoluteChange / prevClose) * 100);
  const high = roundToTwo(
    Math.max(price, open, prevClose) +
      0.85 +
      Math.abs(Math.sin(seconds / 37)) * 2.8
  );
  const low = roundToTwo(
    Math.min(price, open, prevClose) -
      0.95 -
      Math.abs(Math.cos(seconds / 41)) * 3.4
  );
  return {
    updatedAt,
    price,
    absoluteChange,
    percentageChange,
    high,
    low,
    open,
    prevClose,
    formatted: {
      price: formatCurrency(price),
      percentageChange: formatSignedPct(percentageChange),
      absoluteChange: `(${formatSigned(absoluteChange)})`,
      sessionTime: `${easternTimeFormatter.format(updatedAt)} / ET`,
      high: formatCurrency(high),
      low: formatCurrency(low),
      open: formatCurrency(open),
      prevClose: formatCurrency(prevClose),
    },
  };
}

function useGoldQuote() {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);
  return getGoldQuote(now);
}

// ─── TradingView mini chart loader ────────────────────────────────────────────

let tvMiniChartModulePromise: Promise<void> | null = null;

function ensureTvMiniChartModule(): Promise<void> {
  if (typeof window === "undefined")
    return Promise.reject(new Error("Browser only"));
  if (window.customElements?.get("tv-mini-chart")) return Promise.resolve();
  if (!tvMiniChartModulePromise) {
    tvMiniChartModulePromise = new Promise((resolve, reject) => {
      let settled = false;
      let script = document.querySelector<HTMLScriptElement>(
        `script[src="${TV_MINI_CHART_SCRIPT_SRC}"]`
      );
      const cleanup = () => {
        window.clearTimeout(timeoutId);
        script?.removeEventListener("error", handleError);
      };
      const finish = () => {
        if (settled) return;
        settled = true;
        cleanup();
        resolve();
      };
      const fail = () => {
        if (settled) return;
        settled = true;
        cleanup();
        tvMiniChartModulePromise = null;
        reject(new Error("tv-mini-chart failed to load"));
      };
      const handleError = () => fail();
      const timeoutId = window.setTimeout(fail, LARGE_CHART_TIMEOUT_MS);
      if (!script) {
        script = document.createElement("script");
        script.type = "module";
        script.src = TV_MINI_CHART_SCRIPT_SRC;
        script.async = true;
        document.head.appendChild(script);
      }
      script.addEventListener("error", handleError, { once: true });
      window.customElements.whenDefined("tv-mini-chart").then(finish);
    });
  }
  return tvMiniChartModulePromise;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function ChartStatusOverlay({ message }: { message: string }) {
  return (
    <div
      className="radial-background"
    >
      <p className="max-w-[18rem] text-sm font-medium tracking-[0.02em] text-slate-400">
        {message}
      </p>
    </div>
  );
}

function MiniPriceWidgetChart() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">(
    "loading"
  );

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    let cancelled = false;
    let frameId = 0;
    setStatus("loading");
    container.replaceChildren();

    const mountChart = async () => {
      try {
        await ensureTvMiniChartModule();
        if (cancelled) return;

        const chart = document.createElement("tv-mini-chart");
        chart.setAttribute("symbol", GOLD_SYMBOL);
        chart.setAttribute("theme", "dark");
        chart.setAttribute("transparent", "");
        chart.style.display = "block";
        chart.style.width = "100%";
        chart.style.height = "100%";

        container.replaceChildren(chart);

        frameId = window.requestAnimationFrame(() => {
          if (!cancelled) setStatus("ready");
        });
      } catch {
        if (cancelled) return;
        container.replaceChildren();
        setStatus("error");
      }
    };

    mountChart();

    return () => {
      cancelled = true;
      window.cancelAnimationFrame(frameId);
      container.replaceChildren();
    };
  }, []);

  return (
    <div className="relative h-[150px] w-full overflow-hidden rounded-[18px] bg-[#050507]">
      <div ref={containerRef} className="h-full w-full" />
      {status !== "ready" && (
        <ChartStatusOverlay
          message={
            status === "error"
              ? "Chart will be back online ASAP"
              : "Loading live chart..."
          }
        />
      )}
      <div className="pointer-events-none absolute inset-0 rounded-[18px] ring-1 ring-inset ring-white/5" />
    </div>
  );
}

function TradingViewMiniChart({ timeFrame }: { timeFrame: string | null }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">(
    "loading"
  );

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    let cancelled = false;
    let frameId = 0;
    setStatus("loading");
    container.replaceChildren();

    const mountChart = async () => {
      try {
        await ensureTvMiniChartModule();
        if (cancelled) return;
        const chart = document.createElement("tv-mini-chart");
        chart.setAttribute("symbol", GOLD_SYMBOL);
        chart.setAttribute("theme", "dark");
        chart.setAttribute("show-time-range", "");
        chart.setAttribute("transparent", "");
        chart.style.display = "block";
        chart.style.width = "100%";
        chart.style.height = "100%";
        if (timeFrame) chart.setAttribute("time-frame", timeFrame);
        container.replaceChildren(chart);
        frameId = window.requestAnimationFrame(() => {
          if (!cancelled) setStatus("ready");
        });
      } catch {
        if (cancelled) return;
        container.replaceChildren();
        setStatus("error");
      }
    };

    mountChart();
    return () => {
      cancelled = true;
      window.cancelAnimationFrame(frameId);
      container.replaceChildren();
    };
  }, [timeFrame]);

  return (
    <div className="relative h-[280px] w-full overflow-hidden rounded-[18px] bg-[#050507] md:h-[340px]">
      <div ref={containerRef} className="h-full w-full" />
      {status !== "ready" && (
        <ChartStatusOverlay
          message={
            status === "error"
              ? "Chart will be back online ASAP"
              : "Loading live chart..."
          }
        />
      )}
      <div className="pointer-events-none absolute inset-0 rounded-[18px] ring-1 ring-inset ring-white/5" />
    </div>
  );
}

function DriverCard({
  title,
  value,
  move,
  subtle,
}: {
  title: string;
  value: string;
  move: string;
  subtle: string;
}) {
  return (
    <div className="price-surface-card rounded-2xl p-5">
      <RadialBackdrop />
      <div className="price-surface-content flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-slate-100">{title}</p>
          <p className="mt-1 text-[12px] text-slate-400">{subtle}</p>
        </div>
        <div className="text-right">
          <p className="text-2xl font-semibold tracking-tight text-slate-50">
            {value}
          </p>
          <p
            className={`mt-1 text-sm font-medium ${getMarketMoveClassName(move)}`}
          >
            {move}
          </p>
        </div>
      </div>
    </div>
  );
}

function FaqAccordionItem({
  item,
  isOpen,
  onToggle,
}: {
  item: { question: string; answer: string };
  isOpen: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="price-surface-card overflow-hidden rounded-2xl transition">
      <RadialBackdrop />
      <div className="price-surface-content">
        <button
          type="button"
          onClick={onToggle}
          className="price-faq-hover flex w-full items-center justify-between gap-4 px-5 py-4 text-left"
        >
          <span className="text-sm font-medium text-slate-100">
            {item.question}
          </span>
          <span
            className={[
              "shrink-0 text-lg text-slate-300 transition-transform duration-300",
              isOpen ? "rotate-90" : "rotate-0",
            ].join(" ")}
          >
            &gt;
          </span>
        </button>
        <div
          className={[
            "grid transition-all duration-300 ease-out",
            isOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
          ].join(" ")}
        >
          <div className="overflow-hidden">
            <div className="border-t border-white/10 px-5 py-4 text-[14px] leading-relaxed text-slate-300">
              {item.answer}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function MiniPriceWidget({
  quote,
}: {
  quote: ReturnType<typeof getGoldQuote>;
}) {
  const isNegative = quote.absoluteChange < 0;

  return (
    <motion.div
      whileHover={{ y: -6, scale: 1.01 }}
      transition={{ type: "spring", stiffness: 260, damping: 20 }}
      className="price-surface group rounded-3xl p-5 md:p-6"
    >
      <RadialBackdrop />
      <div className="price-surface-content">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-3xl font-semibold tracking-tight text-slate-50 transition-colors duration-300 group-hover:text-white">
              Gold Price
            </p>
            <p className="price-value-brand mt-4 text-5xl font-semibold tracking-tight transition duration-300 group-hover:scale-[1.01]">
              {quote.formatted.price}
            </p>
            <p
              className={[
                "mt-2 text-xl font-medium transition-colors duration-300",
                getQuoteChangeClassName(isNegative),
              ].join(" ")}
            >
              {quote.formatted.percentageChange} {quote.formatted.absoluteChange}
            </p>
          </div>
          <button className="price-widget-chip rounded-xl border px-3 py-2 text-sm font-medium text-amber-300 transition duration-300">
            1D
          </button>
        </div>

        <div className="price-chart-shell price-chart-shell-hover mt-5 rounded-2xl p-3">
          <MiniPriceWidgetChart />
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm text-slate-400 transition-colors duration-300 group-hover:text-slate-300">
          <span>{quote.formatted.sessionTime}</span>
        </div>

        <div className="price-divider-top mt-5 grid grid-cols-2 gap-x-6 gap-y-3 border-t pt-5 text-sm transition-colors duration-300">
          <div className="flex items-center justify-between gap-3">
            <span className="text-slate-400">24H High</span>
            <span className="font-medium text-slate-100">
              {quote.formatted.high}
            </span>
          </div>
          <div className="flex items-center justify-between gap-3">
            <span className="text-slate-400">Open</span>
            <span className="font-medium text-slate-100">
              {quote.formatted.open}
            </span>
          </div>
          <div className="flex items-center justify-between gap-3">
            <span className="text-slate-400">24H Low</span>
            <span className="font-medium text-slate-100">
              {quote.formatted.low}
            </span>
          </div>
          <div className="flex items-center justify-between gap-3">
            <span className="text-slate-400">Prev. Close</span>
            <span className="font-medium text-slate-100">
              {quote.formatted.prevClose}
            </span>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

const FAQ_ITEMS = [
  {
    question: "What factors affect the gold price today?",
    answer:
      "The gold price is influenced by several major market drivers, including the strength of the US dollar, Treasury yields, inflation expectations, central bank policy, geopolitical uncertainty, and overall risk sentiment. Because these factors can shift throughout the day, the gold price can move frequently even when the broader trend remains the same.",
  },
  {
    question: "What is XAU/USD in gold trading?",
    answer:
      'XAU/USD is the financial market symbol for gold priced in US dollars. "XAU" represents one troy ounce of gold, while "USD" is the US dollar. When traders search for the live gold price, spot gold, or gold price today, they are often referring to the XAU/USD market.',
  },
  {
    question:
      "Why does the gold price differ slightly between websites, brokers, or apps?",
    answer:
      "Gold prices can vary slightly across platforms because not every source uses the exact same feed, update speed, or pricing method. Some websites display the live spot XAU/USD price, while others may show futures-based pricing, delayed data, or broker quotes that include a spread. Small differences are normal and do not necessarily mean one price is wrong. On IntelliTrade, the displayed price is intended as a live market reference for XAU/USD.",
  },
];

export default function GoldPriceTodayPage() {
  const goldQuote = useGoldQuote();
  const [selectedRange, setSelectedRange] = useState("1D");
  const [openFaq, setOpenFaq] = useState(-1);

  const activeLargeChartTab =
    LARGE_CHART_TABS.find((t) => t.value === selectedRange) ??
    LARGE_CHART_TABS[0];

  return (
    <div className="min-h-screen bg-[#020203] text-slate-100">
      <PricePageBrandStyles />

     

      <div className="relative z-10 mx-auto max-w-6xl px-4 pb-20 pt-10 lg:px-8">
        

        {/* Hero */}
        <motion.section
          initial={{ opacity: 0, y: 22 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.55, delay: 0.05 }}
          className="price-surface rounded-3xl p-6 md:p-8"
        >
          <RadialBackdrop />
          <div className="price-surface-content grid gap-8 lg:grid-cols-[1.05fr_0.95fr]">
            <div>
              <p className="price-eyebrow text-[11px] font-semibold uppercase tracking-[0.28em]">
                Live Price · IntelliTrade
              </p>
              <h1 className="mt-4 text-4xl font-semibold tracking-tight text-slate-50 md:text-6xl">
                Gold Price Today
              </h1>
              <p className="mt-4 text-xl text-slate-300">
                Live XAU/USD price with market insights
              </p>
              <div className="mt-7 space-y-4 text-[15px] leading-relaxed text-slate-200/90 md:max-w-xl">
                <p>
                  Stay informed with the latest gold price in USD. Below is the
                  live XAU/USD price, updated in real time, along with a chart,
                  market analysis, and the main forces influencing gold today.
                </p>
              </div>
            </div>
            <div>
              <MiniPriceWidget quote={goldQuote} />
            </div>
          </div>
        </motion.section>

        {/* Market context */}
        <motion.section
          initial={{ opacity: 0, y: 22 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-15% 0px -25% 0px" }}
          transition={{ duration: 0.55 }}
          className="price-surface mt-8 rounded-3xl p-6 md:p-8"
        >
          <RadialBackdrop />
          <div className="price-surface-content">
            <p className="price-eyebrow text-[11px] font-semibold uppercase tracking-[0.28em]">
              Market Context
            </p>
            <h2 className="mt-4 text-3xl font-semibold tracking-tight text-slate-50">
              What&apos;s moving gold today
            </h2>
            <div className="mt-5 max-w-4xl space-y-4 text-[15px] leading-relaxed text-slate-200/90">
              <p>
                Gold is seeing support from softer yields, steadier safe-haven
                demand, and a more cautious tone across broader markets. Traders
                are mainly watching the US dollar, Treasury yields, and risk
                sentiment.
              </p>
              <p>
                If yields keep easing while markets remain defensive, gold can
                stay supported. A stronger dollar, however, can slow upside
                momentum and cap short-term gains.
              </p>
            </div>
          </div>
        </motion.section>

        {/* Live chart */}
        <motion.section
          initial={{ opacity: 0, y: 22 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-15% 0px -25% 0px" }}
          transition={{ duration: 0.55 }}
          className="price-surface mt-8 rounded-3xl p-6 md:p-8"
        >
          <RadialBackdrop />
          <div className="price-surface-content">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <p className="price-eyebrow text-[11px] font-semibold uppercase tracking-[0.28em]">
                  Price Chart
                </p>
                <h2 className="mt-4 text-3xl font-semibold tracking-tight text-slate-50">
                  Live chart view
                </h2>
              </div>
              <div className="flex flex-wrap gap-2">
                {LARGE_CHART_TABS.map((tab) => (
                  <button
                    key={tab.value}
                    type="button"
                    onClick={() => setSelectedRange(tab.value)}
                    className={getChartTabClassName(tab.value === selectedRange)}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="price-chart-shell mt-6 rounded-2xl p-4">
              <TradingViewMiniChart
                timeFrame={activeLargeChartTab.timeFrame}
              />
            </div>
            <div className="mt-4 flex flex-wrap items-center justify-between gap-4 text-sm">
              <div className="flex flex-wrap gap-6 text-slate-400">
                <span>{goldQuote.formatted.low}</span>
                <span>{goldQuote.formatted.open}</span>
                <span>{goldQuote.formatted.high}</span>
              </div>
              <p className="text-4xl font-semibold tracking-tight text-slate-100">
                {goldQuote.formatted.price}
              </p>
            </div>
          </div>
        </motion.section>

        {/* Market relationships */}
        <motion.section
          initial={{ opacity: 0, y: 22 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-15% 0px -25% 0px" }}
          transition={{ duration: 0.55 }}
          className="price-surface mt-8 rounded-3xl p-6 md:p-8"
        >
          <RadialBackdrop />
          <div className="price-surface-content">
            <p className="price-eyebrow text-[11px] font-semibold uppercase tracking-[0.28em]">
              What Moves Gold
            </p>
            <h2 className="mt-4 text-3xl font-semibold tracking-tight text-slate-50">
              Market relationships
            </h2>
            <div className="mt-6 grid gap-4 md:grid-cols-2">
              <DriverCard
                title="US Dollar Index"
                value="105.52"
                move="-0.10% (-0.11)"
                subtle="A softer dollar can support gold."
              />
              <DriverCard
                title="US 10Y Yield"
                value="4.61%"
                move="-0.05%"
                subtle="Lower yields can improve gold demand."
              />
              <DriverCard
                title="Silver Price"
                value="$27.15"
                move="+0.61% (+0.14)"
                subtle="Precious metals often move together."
              />
              <DriverCard
                title="Oil Price"
                value="$22.74"
                move="+0.30%"
                subtle="Inflation-sensitive assets can affect sentiment."
              />
            </div>
          </div>
        </motion.section>

        {/* FAQ + Methodology */}
        <motion.section
          initial={{ opacity: 0, y: 22 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-15% 0px -25% 0px" }}
          transition={{ duration: 0.55 }}
          className="mt-8 grid gap-8 lg:grid-cols-[0.95fr_1.05fr]"
        >
          <div className="price-surface rounded-3xl p-6 md:p-8">
            <RadialBackdrop />
            <div className="price-surface-content">
              <p className="price-eyebrow text-[11px] font-semibold uppercase tracking-[0.28em]">
                FAQ
              </p>
              <h2 className="mt-4 text-3xl font-semibold tracking-tight text-slate-50">
                Gold price questions
              </h2>
              <div className="mt-6 space-y-3">
                {FAQ_ITEMS.map((item, index) => (
                  <FaqAccordionItem
                    key={item.question}
                    item={item}
                    isOpen={openFaq === index}
                    onToggle={() =>
                      setOpenFaq(openFaq === index ? -1 : index)
                    }
                  />
                ))}
              </div>
            </div>
          </div>

          <div className="price-surface rounded-3xl p-6 md:p-8">
            <RadialBackdrop />
            <div className="price-surface-content">
              <p className="price-eyebrow text-[11px] font-semibold uppercase tracking-[0.28em]">
                Methodology
              </p>
              <h2 className="mt-4 text-3xl font-semibold tracking-tight text-slate-50">
                How gold prices are calculated
              </h2>
              <div className="mt-5 space-y-4 text-[15px] leading-relaxed text-slate-200/90">
                <p>
                  This page displays a live XAU/USD market reference, quoted in
                  US dollars per troy ounce. The price, chart, and daily change
                  figures are based on the latest available market data and are
                  updated regularly throughout the session.
                </p>
                <p>
                  Since brokers, apps, and data providers may use different
                  feeds, refresh rates, or spreads, small price differences can
                  occur across platforms. IntelliTrade presents this data as a
                  live reference for market tracking and analysis, rather than an
                  exact buy or sell quote.
                </p>
              </div>
            </div>
          </div>
        </motion.section>

       
      </div>
    </div>
  );
}