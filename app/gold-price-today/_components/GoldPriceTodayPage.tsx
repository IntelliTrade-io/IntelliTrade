"use client";

import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { ChevronRight } from "lucide-react";
import {
  PricePageBrandStyles,
  RadialBackdrop,
} from "@/components/price-pages/PricePageBrand";
import { fetchUsdPrice, fetchDxy, fetchTenYearYield } from "@/lib/api/market";
import type { MarketContext } from "@/lib/api/marketContext";
import type { PriceChangeFigures } from "@/lib/api/priceHistory";
import { MarketContextExtras } from "@/components/price-pages/MarketContextExtras";
import { PriceChangeStats } from "@/components/price-pages/PriceChangeStats";
import { PricePageFooterNote } from "@/components/price-pages/PricePageFooterNote";
import { FAQ_ITEMS } from "./faqData";

// ─── Constants ────────────────────────────────────────────────────────────────

const GOLD_SYMBOL = "OANDA:XAUUSD";

const TV_MINI_CHART_SCRIPT_SRC =
  "https://widgets.tradingview-widget.com/w/en/tv-mini-chart.js";
const QUOTE_REFRESH_MS = 30_000;

const LARGE_CHART_TIMEOUT_MS = 6000;

// ─── Formatters ───────────────────────────────────────────────────────────────

const currencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

function roundToTwo(v: number) {
  return Math.round(v * 100) / 100;
}
function formatCurrency(v: number) {
  return currencyFormatter.format(v);
}


// ─── Market data (silver + 10Y yield) ────────────────────────────────────────

type MarketData = {
  silverPrice: string | null;
  tenYearYield: string | null;
};

function useMarketData(
  initialSilverPrice: number | null,
  initialTenYearYield: number | null,
): MarketData {
  const [data, setData] = useState<MarketData>({
    silverPrice: initialSilverPrice === null ? null : formatCurrency(roundToTwo(initialSilverPrice)),
    tenYearYield: initialTenYearYield === null ? null : `${initialTenYearYield.toFixed(2)}%`,
  });

  useEffect(() => {
    let cancelled = false;

    const fetchSilver = async () => {
      const price = await fetchUsdPrice("XAG");
      return price === null ? null : formatCurrency(roundToTwo(price));
    };

    // The server render seeds both values; the browser only fetches immediately
    // when the server had nothing, then refreshes the silver quote on a timer.
    if (initialTenYearYield === null) {
      fetchTenYearYield().then((y) => {
        if (!cancelled && y !== null) setData((prev) => ({ ...prev, tenYearYield: `${y.toFixed(2)}%` }));
      });
    }
    if (initialSilverPrice === null) {
      fetchSilver().then((silverPrice) => {
        if (!cancelled && silverPrice) setData((prev) => ({ ...prev, silverPrice }));
      });
    }

    const id = window.setInterval(() => {
      fetchSilver().then((silverPrice) => {
        if (!cancelled) setData((prev) => ({ ...prev, silverPrice: silverPrice ?? prev.silverPrice }));
      });
    }, QUOTE_REFRESH_MS);

    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [initialSilverPrice, initialTenYearYield]);

  return data;
}

// ─── DXY ─────────────────────────────────────────────────────────────────────

function useDxy(initialDxy: number | null): string | null {
  const [value, setValue] = useState<string | null>(initialDxy === null ? null : initialDxy.toFixed(2));
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const dxy = await fetchDxy();
      if (dxy == null || cancelled) return;
      setValue(dxy.toFixed(2));
    };
    if (initialDxy === null) load();
    const id = window.setInterval(load, 300_000);
    return () => { cancelled = true; window.clearInterval(id); };
  }, [initialDxy]);
  return value;
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
        chart.style.position = "absolute";
        chart.style.inset = "0";
        chart.style.width = "100%";
        chart.style.height = "100%";
        chart.style.maxWidth = "100%";
        chart.style.minWidth = "0";

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
    <div className="relative h-[150px] w-full overflow-hidden rounded-[18px] bg-[#050507]" style={{ contain: "paint", minWidth: 0 }}>
      <div ref={containerRef} className="absolute inset-0" />
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

// TradingView Symbol Overview: a richer-than-mini area chart with its own
// built-in date-range tabs (1D / 1M / 3M / 12M / 60M / All), price header and
// value tracking. Themed to the gold accent and transparent so it sits on the
// panel. It manages its own ranges, so the page carries no custom tab row.
function TradingViewSymbolOverview() {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    container.replaceChildren();

    const widget = document.createElement("div");
    widget.className = "tradingview-widget-container__widget";
    widget.style.height = "100%";
    widget.style.width = "100%";
    container.appendChild(widget);

    const script = document.createElement("script");
    script.src =
      "https://s3.tradingview.com/external-embedding/embed-widget-symbol-overview.js";
    script.async = true;
    script.type = "text/javascript";
    script.innerHTML = JSON.stringify({
      symbols: [["Gold", `${GOLD_SYMBOL}|1D`]],
      chartOnly: false,
      width: "100%",
      height: "100%",
      locale: "en",
      colorTheme: "dark",
      autosize: true,
      showVolume: false,
      showMA: false,
      hideDateRanges: false,
      hideMarketStatus: false,
      hideSymbolLogo: false,
      scalePosition: "right",
      scaleMode: "Normal",
      fontFamily:
        "-apple-system, BlinkMacSystemFont, Trebuchet MS, Roboto, Ubuntu, sans-serif",
      fontSize: "10",
      noTimeScale: false,
      valuesTracking: "1",
      changeMode: "price-and-percent",
      chartType: "area",
      lineWidth: 2,
      lineType: 0,
      dateRanges: ["1d|1", "1m|30", "3m|60", "12m|1D", "60m|1W", "all|1M"],
      lineColor: "rgba(245, 158, 11, 1)",
      topColor: "rgba(245, 158, 11, 0.25)",
      bottomColor: "rgba(245, 158, 11, 0)",
      backgroundColor: "#050507",
      gridLineColor: "rgba(255, 255, 255, 0.06)",
      isTransparent: false,
    });
    container.appendChild(script);

    return () => {
      container.replaceChildren();
    };
  }, []);

  return (
    <div className="relative h-[360px] w-full overflow-hidden rounded-[18px] bg-[#050507] md:h-[440px]" style={{ contain: "paint", minWidth: 0 }}>
      <div ref={containerRef} className="tradingview-widget-container absolute inset-0" />
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
          <ChevronRight
            aria-hidden
            className={[
              "h-5 w-5 shrink-0 text-slate-300 transition-transform duration-300",
              isOpen ? "rotate-90" : "rotate-0",
            ].join(" ")}
          />
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

function MiniPriceWidget() {

  return (
    <motion.div className="price-surface rounded-3xl p-5 md:p-6">
      <RadialBackdrop />
      <div className="price-surface-content">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xl sm:text-3xl font-semibold tracking-tight text-slate-50">
              Gold Price
            </p>
          </div>
          <button className="price-widget-chip rounded-xl border px-3 py-2 text-sm font-medium text-amber-300">
            1D
          </button>
        </div>
        <div className="price-chart-shell mt-5 rounded-2xl p-3">
          <MiniPriceWidgetChart />
        </div>

      </div>
    </motion.div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function GoldPriceTodayPage({
  marketContext,
  priceChanges,
  initialSilverPrice,
  initialTenYearYield,
  initialDxy,
}: {
  marketContext: MarketContext | null;
  priceChanges: PriceChangeFigures | null;
  initialSilverPrice: number | null;
  initialTenYearYield: number | null;
  initialDxy: number | null;
}) {
  const marketData = useMarketData(initialSilverPrice, initialTenYearYield);
  const dxy = useDxy(initialDxy);
  const [openFaq, setOpenFaq] = useState(-1);

  return (
    <div className="min-h-screen bg-[#020203] text-slate-100 overflow-x-hidden">
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
              <h1 className="mt-4 text-3xl font-semibold tracking-tight text-slate-50 md:text-6xl">
                Gold Price Today
              </h1>
              <p className="mt-3 text-base sm:text-xl text-slate-300">
                Live XAU/USD price with market insights
              </p>
              <div className="mt-7 space-y-4 text-[15px] leading-relaxed text-slate-200/90 md:max-w-xl">
                <p>
                  Stay informed with the latest gold price in USD. Below is the
                  live XAU/USD price, updated in real time, along with a chart,
                  market analysis, and the main forces influencing gold today.
                </p>
              </div>
              <PriceChangeStats figures={priceChanges} assetLabel="gold" />
            </div>
            <div>
              <MiniPriceWidget />
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
              {marketContext?.paragraphs?.length ? (
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
            <MarketContextExtras context={marketContext} />
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
            <div>
              <p className="price-eyebrow text-[11px] font-semibold uppercase tracking-[0.28em]">
                Price Chart
              </p>
              <h2 className="text-3xl font-semibold tracking-tight text-slate-50">
                Live chart view
              </h2>
            </div>
            <div className="price-chart-shell mt-6 rounded-2xl p-4">
              <TradingViewSymbolOverview />
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
                title="Gold 30-Day Change"
                value={
                  priceChanges?.d30 != null
                    ? `${priceChanges.d30 > 0 ? "+" : ""}${priceChanges.d30.toFixed(2)}%`
                    : "—"
                }
                subtle="Momentum context for the current move."
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

        <PricePageFooterNote asset="gold" />

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