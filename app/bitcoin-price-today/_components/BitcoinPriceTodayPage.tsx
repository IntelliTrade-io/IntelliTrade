"use client";

import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { ChevronRight } from "lucide-react";
import {
  PricePageBrandStyles,
  RadialBackdrop,
} from "@/components/price-pages/PricePageBrand";
import { fetchDxy, fetchTenYearYield } from "@/lib/api/market";
import type { MarketContext } from "@/lib/api/marketContext";
import type { PriceChangeFigures } from "@/lib/api/priceHistory";
import { MarketContextExtras } from "@/components/price-pages/MarketContextExtras";
import { PriceChangeStats } from "@/components/price-pages/PriceChangeStats";
import { PricePageFooterNote } from "@/components/price-pages/PricePageFooterNote";
import { FAQ_ITEMS } from "./faqData";

// ─── Constants ────────────────────────────────────────────────────────────────

const BITCOIN_SYMBOL = "COINBASE:BTCUSD";
const TV_MINI_CHART_SCRIPT_SRC = "https://widgets.tradingview-widget.com/w/en/tv-mini-chart.js";
const LARGE_CHART_TIMEOUT_MS = 6000;

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

// ─── Market data (10Y yield) ──────────────────────────────────────────────────

function useTenYearYield(initialTenYearYield: number | null): string | null {
  const [value, setValue] = useState<string | null>(
    initialTenYearYield === null ? null : `${initialTenYearYield.toFixed(2)}%`,
  );

  useEffect(() => {
    // The server render seeds the value; only fetch when it had nothing.
    if (initialTenYearYield !== null) return;
    let cancelled = false;
    const fetch_ = async () => {
      const y = await fetchTenYearYield();
      if (y == null || cancelled) return;
      setValue(`${y.toFixed(2)}%`);
    };
    fetch_();
    return () => { cancelled = true; };
  }, [initialTenYearYield]);

  return value;
}

// ─── TradingView loader ───────────────────────────────────────────────────────

let tvMiniChartModulePromise: Promise<void> | null = null;

function ensureTvMiniChartModule(): Promise<void> {
  if (typeof window === "undefined") return Promise.reject(new Error("Browser only"));
  if (window.customElements?.get("tv-mini-chart")) return Promise.resolve();
  if (!tvMiniChartModulePromise) {
    tvMiniChartModulePromise = new Promise((resolve, reject) => {
      let settled = false;
      let script = document.querySelector<HTMLScriptElement>(`script[src="${TV_MINI_CHART_SCRIPT_SRC}"]`);
      const cleanup = () => { window.clearTimeout(timeoutId); script?.removeEventListener("error", handleError); };
      const finish = () => { if (settled) return; settled = true; cleanup(); resolve(); };
      const fail = () => { if (settled) return; settled = true; cleanup(); tvMiniChartModulePromise = null; reject(new Error("tv-mini-chart failed to load")); };
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
    <div className="radial-background">
      <p className="max-w-[18rem] text-sm font-medium tracking-[0.02em] text-slate-400">{message}</p>
    </div>
  );
}

function MiniPriceWidgetChart() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");

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
        chart.setAttribute("symbol", BITCOIN_SYMBOL);
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
        frameId = window.requestAnimationFrame(() => { if (!cancelled) setStatus("ready"); });
      } catch {
        if (cancelled) return;
        container.replaceChildren();
        setStatus("error");
      }
    };
    mountChart();
    return () => { cancelled = true; window.cancelAnimationFrame(frameId); container.replaceChildren(); };
  }, []);

  return (
    <div className="relative h-[150px] w-full overflow-hidden rounded-[18px] bg-[#050507]" style={{ contain: "paint", minWidth: 0 }}>
      <div ref={containerRef} className="absolute inset-0" />
      {status !== "ready" && <ChartStatusOverlay message={status === "error" ? "Chart will be back online ASAP" : "Loading live chart..."} />}
      <div className="pointer-events-none absolute inset-0 rounded-[18px] ring-1 ring-inset ring-white/5" />
    </div>
  );
}

// TradingView Symbol Overview: a richer-than-mini area chart with its own
// built-in date-range tabs (1D / 1M / 3M / 12M / 60M / All), price header and
// value tracking. Themed to the bitcoin accent and transparent so it sits on
// the panel. It manages its own ranges, so the page carries no custom tab row.
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
      symbols: [["Bitcoin", `${BITCOIN_SYMBOL}|1D`]],
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
      lineColor: "rgba(249, 115, 22, 1)",
      topColor: "rgba(249, 115, 22, 0.25)",
      bottomColor: "rgba(249, 115, 22, 0)",
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

function DriverCard({ title, value, subtle }: { title: string; value: string; subtle: string }) {
  return (
    <div className="price-surface-card rounded-2xl p-5">
      <RadialBackdrop />
      <div className="price-surface-content flex items-center justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-slate-100">{title}</p>
          <p className="mt-1 text-[12px] text-slate-400">{subtle}</p>
        </div>
        <div className="text-right">
          <p className="text-2xl font-semibold tracking-tight text-slate-50">{value}</p>
        </div>
      </div>
    </div>
  );
}

function FaqAccordionItem({ item, isOpen, onToggle }: { item: { question: string; answer: string }; isOpen: boolean; onToggle: () => void }) {
  return (
    <div className="price-surface-card overflow-hidden rounded-2xl transition">
      <RadialBackdrop />
      <div className="price-surface-content">
        <button type="button" onClick={onToggle} className="price-faq-hover flex w-full items-center justify-between gap-4 px-5 py-4 text-left">
          <span className="text-sm font-medium text-slate-100">{item.question}</span>
          <ChevronRight aria-hidden className={["h-5 w-5 shrink-0 text-slate-300 transition-transform duration-300", isOpen ? "rotate-90" : "rotate-0"].join(" ")} />
        </button>
        <div className={["grid transition-all duration-300 ease-out", isOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]"].join(" ")}>
          <div className="overflow-hidden">
            <div className="border-t border-white/10 px-5 py-4 text-[14px] leading-relaxed text-slate-300">{item.answer}</div>
          </div>
        </div>
      </div>
    </div>
  );
}

function MiniPriceWidget() {
  return (
    <motion.div
      className="price-surface rounded-3xl p-5 md:p-6"
    >
      <RadialBackdrop />
      <div className="price-surface-content">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-base sm:text-3xl font-semibold tracking-tight text-slate-50">Bitcoin Price</p>
          </div>
          <button className="price-widget-chip rounded-xl border px-3 py-2 text-sm font-medium text-orange-400">1D</button>
        </div>
        <div className="price-chart-shell mt-5 rounded-2xl p-3">
          <MiniPriceWidgetChart />
        </div>
      </div>
    </motion.div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function BitcoinPriceTodayPage({
  marketContext,
  priceChanges,
  initialTenYearYield,
  initialDxy,
}: {
  marketContext: MarketContext | null;
  priceChanges: PriceChangeFigures | null;
  initialTenYearYield: number | null;
  initialDxy: number | null;
}) {
  const tenYearYield = useTenYearYield(initialTenYearYield);
  const dxy = useDxy(initialDxy);
  const [openFaq, setOpenFaq] = useState(-1);

  return (
    <div className="min-h-screen bg-[#020203] text-slate-100 overflow-x-hidden">
      <PricePageBrandStyles theme="bitcoin" />
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
              <p className="price-eyebrow text-[11px] font-semibold uppercase tracking-[0.28em]">Live Price · IntelliTrade</p>
              <h1 className="mt-4 text-3xl font-semibold tracking-tight text-slate-50 md:text-6xl">Bitcoin Price Today</h1>
              <p className="mt-3 text-base sm:text-xl text-slate-300">Live BTC/USD price with market insights</p>
              <div className="mt-7 space-y-4 text-[15px] leading-relaxed text-slate-200/90 md:max-w-xl">
                <p>Stay informed with the latest bitcoin price in USD. Below is the live BTC/USD price, updated in real time, along with a chart, market analysis, and the main forces influencing bitcoin today.</p>
              </div>
              <PriceChangeStats figures={priceChanges} assetLabel="bitcoin" />
            </div>
            <div><MiniPriceWidget /></div>
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
            <p className="price-eyebrow text-[11px] font-semibold uppercase tracking-[0.28em]">Market Context</p>
            <h2 className="mt-4 text-3xl font-semibold tracking-tight text-slate-50">
              {marketContext?.heading ?? "What\u2019s moving bitcoin today"}
            </h2>
            <div className="mt-5 max-w-4xl space-y-4 text-[15px] leading-relaxed text-slate-200/90">
              {marketContext?.paragraphs?.length ? (
                marketContext.paragraphs.map((p, i) => <p key={i}>{p.text}</p>)
              ) : (
                <>
                  <p>Bitcoin is being driven by risk sentiment, liquidity conditions, and positioning shifts across global macro and crypto markets. Traders are mainly watching the dollar, yields, and equities tone.</p>
                  <p>If liquidity conditions improve while risk appetite holds, bitcoin can remain supported. A stronger dollar, however, can pressure momentum and cap short-term gains.</p>
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
              <p className="price-eyebrow text-[11px] font-semibold uppercase tracking-[0.28em]">Price Chart</p>
              <h2 className="text-3xl font-semibold tracking-tight text-slate-50">Live chart view</h2>
            </div>
            <div className="price-chart-shell mt-6 rounded-2xl p-4"><TradingViewSymbolOverview /></div>
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
            <p className="price-eyebrow text-[11px] font-semibold uppercase tracking-[0.28em]">What Moves Bitcoin</p>
            <h2 className="mt-4 text-3xl font-semibold tracking-tight text-slate-50">Market relationships</h2>
            <div className="mt-6 grid gap-4 md:grid-cols-2">
              <DriverCard title="US Dollar Index (DXY)" value={dxy ?? "—"} subtle="Dollar direction can influence global crypto demand." />
              <DriverCard title="US 10Y Yield" value={tenYearYield ?? "—"} subtle="Rate expectations can shift crypto risk appetite." />
              <DriverCard title="Risk sentiment (Equities / Nasdaq)" value="" subtle="Broader risk tone often spills into bitcoin." />
              <DriverCard title="Liquidity / Macro headlines" value="" subtle="Liquidity signals can amplify short-term moves." />
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
              <p className="price-eyebrow text-[11px] font-semibold uppercase tracking-[0.28em]">FAQ</p>
              <h2 className="mt-4 text-3xl font-semibold tracking-tight text-slate-50">Bitcoin price questions</h2>
              <div className="mt-6 space-y-3">
                {FAQ_ITEMS.map((item, index) => (
                  <FaqAccordionItem key={item.question} item={item} isOpen={openFaq === index} onToggle={() => setOpenFaq(openFaq === index ? -1 : index)} />
                ))}
              </div>
            </div>
          </div>
          <div className="price-surface rounded-3xl p-6 md:p-8">
            <RadialBackdrop />
            <div className="price-surface-content">
              <p className="price-eyebrow text-[11px] font-semibold uppercase tracking-[0.28em]">Methodology</p>
              <h2 className="mt-4 text-3xl font-semibold tracking-tight text-slate-50">How bitcoin prices are calculated</h2>
              <div className="mt-5 space-y-4 text-[15px] leading-relaxed text-slate-200/90">
                <p>The bitcoin price on this page is shown as a BTC/USD market reference, refreshed continuously to reflect the latest available data. Charts and daily change figures are calculated from the same underlying stream shown on the page.</p>
                <p>Because crypto trading is fragmented across exchanges and venues, the displayed price can differ slightly from other platforms due to spreads, liquidity, and pricing methodology. This page is intended as a live reference for tracking, not a guaranteed execution price.</p>
              </div>
            </div>
          </div>
        </motion.section>

        <PricePageFooterNote asset="bitcoin" />

        {/* Data credits */}
        <p className="mt-10 text-center text-[11px] text-slate-600">
          Bitcoin price data provided by{" "}
          <a href="https://currencyfreaks.com" target="_blank" rel="noopener noreferrer" className="underline hover:text-slate-400 transition-colors">
            CurrencyFreaks
          </a>
          . 10-year yield data provided by the{" "}
          <a href="https://fred.stlouisfed.org/series/DGS10" target="_blank" rel="noopener noreferrer" className="underline hover:text-slate-400 transition-colors">
            Federal Reserve Bank of St. Louis (FRED)
          </a>
          .
        </p>

      </div>
    </div>
  );
}
