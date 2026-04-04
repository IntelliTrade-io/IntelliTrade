"use client";

import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import {
  PricePageBrandStyles,
  RadialBackdrop,

  getChartTabClassName
} from "./lib/pricePageBrand";
import '@/styles/lot-size-calculator.css';
import { client } from "@/sanity/client";

// ─── Market context from Sanity ───────────────────────────────────────────────

type MarketContextData = {
  heading: string;
  paragraphs: Array<{ text: string }>;
} | null;

function useMarketContext(asset: string): MarketContextData {
  const [data, setData] = useState<MarketContextData>(null);

  useEffect(() => {
    let cancelled = false;
    client
      .fetch<MarketContextData>(
        `*[_type == "marketContext" && asset == $asset] | order(date desc)[0] {
          heading,
          paragraphs
        }`,
        { asset }
      )
      .then((result) => { if (!cancelled) setData(result ?? null); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [asset]);

  return data;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const GOLD_SYMBOL = "OANDA:XAUUSD";

const TV_MINI_CHART_SCRIPT_SRC =
  "https://widgets.tradingview-widget.com/w/en/tv-mini-chart.js";
const QUOTE_REFRESH_MS = 30_000;

const LARGE_CHART_TIMEOUT_MS = 6000;


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


// ─── Market data (silver + 10Y yield) ────────────────────────────────────────

type MarketData = {
  silverPrice: string | null;
  tenYearYield: string | null;
};

function useMarketData(): MarketData {
  const [data, setData] = useState<MarketData>({ silverPrice: null, tenYearYield: null });

  useEffect(() => {
    let cancelled = false;

    const fetchSilver = async () => {
      const apiKey = process.env.NEXT_PUBLIC_CURRENCYFREAKS_API_KEY;
      if (!apiKey) return null;
      try {
        const res = await fetch(
          `https://api.currencyfreaks.com/v2.0/rates/latest?apikey=${apiKey}&symbols=XAG`,
          { cache: "no-store" }
        );
        if (!res.ok) return null;
        const json = await res.json();
        const xagPerUsd = parseFloat(json.rates?.XAG);
        if (!isFinite(xagPerUsd) || xagPerUsd <= 0) return null;
        return formatCurrency(roundToTwo(1 / xagPerUsd));
      } catch {
        return null;
      }
    };

    const fetchYield = async () => {
      try {
        const res = await fetch("/api/fred-yield");
        if (!res.ok) return null;
        const json = await res.json();
        if (json.yield == null) return null;
        return `${(json.yield as number).toFixed(2)}%`;
      } catch {
        return null;
      }
    };

    const load = async () => {
      const [silverPrice, tenYearYield] = await Promise.all([fetchSilver(), fetchYield()]);
      if (!cancelled) setData({ silverPrice, tenYearYield });
    };

    load();
    const id = window.setInterval(() => {
      fetchSilver().then((silverPrice) => {
        if (!cancelled) setData((prev) => ({ ...prev, silverPrice: silverPrice ?? prev.silverPrice }));
      });
    }, QUOTE_REFRESH_MS);

    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, []);

  return data;
}

// ─── DXY ─────────────────────────────────────────────────────────────────────

function useDxy(): string | null {
  const [value, setValue] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch("/api/dxy");
        if (!res.ok || cancelled) return;
        const json = await res.json();
        if (json.dxy == null || cancelled) return;
        setValue((json.dxy as number).toFixed(2));
      } catch {}
    };
    load();
    const id = window.setInterval(load, 300_000);
    return () => { cancelled = true; window.clearInterval(id); };
  }, []);
  return value;
}

// ─── Quote logic ──────────────────────────────────────────────────────────────

type GoldQuote = {
  updatedAt: number;
  price: number;
  absoluteChange: number;
  percentageChange: number;
  high: number;
  low: number;
  open: number;
  formatted: {
    price: string;
    percentageChange: string;
    absoluteChange: string;
    sessionTime: string;
    high: string;
    low: string;
    open: string;
  };
};

function useGoldPrice(): GoldQuote | null {
  const [quote, setQuote] = useState<GoldQuote | null>(null);
  const openRef = useRef<number | null>(null);
  const highRef = useRef<number>(-Infinity);
  const lowRef = useRef<number>(Infinity);

  useEffect(() => {
    let cancelled = false;

    const fetchPrice = async () => {
      const apiKey = process.env.NEXT_PUBLIC_CURRENCYFREAKS_API_KEY;
      if (!apiKey) return;
      try {
        const res = await fetch(
          `https://api.currencyfreaks.com/v2.0/rates/latest?apikey=${apiKey}&symbols=XAU`,
          { cache: "no-store" }
        );
        if (!res.ok || cancelled) return;
        const data = await res.json();
        const xauPerUsd = parseFloat(data.rates?.XAU);
        if (!isFinite(xauPerUsd) || xauPerUsd <= 0 || cancelled) return;

        const price = roundToTwo(1 / xauPerUsd);
        if (openRef.current === null) openRef.current = price;
        if (price > highRef.current) highRef.current = price;
        if (price < lowRef.current) lowRef.current = price;

        const open = openRef.current;
        const high = highRef.current;
        const low = lowRef.current;
        const absoluteChange = roundToTwo(price - open);
        const percentageChange = roundToTwo((absoluteChange / open) * 100);
        const updatedAt = Date.now();

        setQuote({
          updatedAt,
          price,
          absoluteChange,
          percentageChange,
          high,
          low,
          open,
          formatted: {
            price: formatCurrency(price),
            percentageChange: formatSignedPct(percentageChange),
            absoluteChange: `(${formatSigned(absoluteChange)})`,
            sessionTime: `${easternTimeFormatter.format(updatedAt)} / ET`,
            high: formatCurrency(high),
            low: formatCurrency(low),
            open: formatCurrency(open),
          },
        });
      } catch {
        // keep showing last known price on failure
      }
    };

    fetchPrice();
    const id = window.setInterval(fetchPrice, QUOTE_REFRESH_MS);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, []);

  return quote;
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
  subtle,
}: {
  title: string;
  value: string;
  subtle: string;
}) {
  return (
    <div className="price-surface-card rounded-2xl p-5 ">
      <RadialBackdrop />
      <div className="price-surface-content flex items-start justify-between gap-4 items-center">
        <div>
          <p className="text-sm font-medium text-slate-100">{title}</p>
          <p className="mt-1 text-[12px] text-slate-400">{subtle}</p>
        </div>
        <div className="text-right">
          <p className="text-2xl font-semibold tracking-tight text-slate-50">
            {value}
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

function MiniPriceWidget({ quote }: { quote: GoldQuote | null }) {

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
              {quote?.formatted.price ?? "—"}
            </p>
          </div>
          <button className="price-widget-chip rounded-xl border px-3 py-2 text-sm font-medium text-amber-300 transition duration-300">
            1D
          </button>
        </div>
        <div className="price-chart-shell price-chart-shell-hover mt-5 rounded-2xl p-3">
          <MiniPriceWidgetChart />
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
  const goldQuote = useGoldPrice();
  const marketData = useMarketData();
  const dxy = useDxy();
  const marketContext = useMarketContext("gold");
  const [selectedRange, setSelectedRange] = useState("1D");
  const [openFaq, setOpenFaq] = useState(-1);

  const activeLargeChartTab =
    LARGE_CHART_TABS.find((t) => t.value === selectedRange) ??
    LARGE_CHART_TABS[0];

  return (
    <div className="min-h-screen bg-[#020203] text-slate-100">
      <PricePageBrandStyles theme="gold" />

     

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
              {marketContext?.heading ?? "What\u2019s moving gold today"}
            </h2>
            <div className="mt-5 max-w-4xl space-y-4 text-[15px] leading-relaxed text-slate-200/90">
              {marketContext ? (
                marketContext.paragraphs.map((p, i) => <p key={i}>{p.text}</p>)
              ) : (
                <>
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
                </>
              )}
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
                <h2 className="text-3xl font-semibold tracking-tight text-slate-50">
                  Live chart view
                </h2>
                <div className="flex flex-wrap gap-2">
                {LARGE_CHART_TABS.map((tab) => (
                  <button
                    key={tab.value}
                    type="button"
                    onClick={() => setSelectedRange(tab.value)}
                    className={getChartTabClassName(tab.value === selectedRange, "gold")}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
              </div>
              
            <div className="flex flex-wrap items-center justify-between gap-4 text-sm">
              <p className="text-4xl font-semibold tracking-tight text-slate-100 price-value-brand">
                {goldQuote?.formatted.price ?? "—"}
              </p>
            </div>
              
            </div>
            <div className="price-chart-shell mt-6 rounded-2xl p-4">
              <TradingViewMiniChart
                timeFrame={activeLargeChartTab.timeFrame}
              />
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
                value={dxy ?? "—"}
                subtle="A softer dollar can support gold."
              />
              <DriverCard
                title="US 10Y Yield"
                value={marketData.tenYearYield ?? "—"}
                subtle="Lower yields can improve gold demand."
              />
              <DriverCard
                title="Silver Price"
                value={marketData.silverPrice ?? "—"}
                subtle="Precious metals often move together."
              />
              <DriverCard
                title="Oil Price"
                value="$22.74"
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

        {/* Data credits */}
        <p className="mt-10 text-center text-[11px] text-slate-600">
          10-year yield data provided by the{" "}
          <a
            href="https://fred.stlouisfed.org/series/DGS10"
            target="_blank"
            rel="noopener noreferrer"
            className="underline hover:text-slate-400 transition-colors"
          >
            Federal Reserve Bank of St. Louis (FRED)
          </a>
          .
        </p>

      </div>
    </div>
  );
}