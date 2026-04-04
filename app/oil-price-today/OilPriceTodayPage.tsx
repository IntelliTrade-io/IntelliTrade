"use client";

import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import {
  PricePageBrandStyles,
  RadialBackdrop,
  getChartTabClassName,
} from "../gold-price-today/lib/pricePageBrand";
import "@/styles/lot-size-calculator.css";
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

// ─── Constants ────────────────────────────────────────────────────────────────

const OIL_SYMBOL = "BLACKBULL:BRENT";
const TV_MINI_CHART_SCRIPT_SRC = "https://widgets.tradingview-widget.com/w/en/tv-mini-chart.js";
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
        chart.setAttribute("symbol", OIL_SYMBOL);
        chart.setAttribute("theme", "dark");
        chart.setAttribute("transparent", "");
        chart.style.display = "block";
        chart.style.width = "100%";
        chart.style.height = "100%";
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
    <div className="relative h-[150px] w-full overflow-hidden rounded-[18px] bg-[#050507]">
      <div ref={containerRef} className="h-full w-full" />
      {status !== "ready" && <ChartStatusOverlay message={status === "error" ? "Chart will be back online ASAP" : "Loading live chart..."} />}
      <div className="pointer-events-none absolute inset-0 rounded-[18px] ring-1 ring-inset ring-white/5" />
    </div>
  );
}

function TradingViewMiniChart({ timeFrame }: { timeFrame: string | null }) {
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
        chart.setAttribute("symbol", OIL_SYMBOL);
        chart.setAttribute("theme", "dark");
        chart.setAttribute("show-time-range", "");
        chart.setAttribute("transparent", "");
        chart.style.display = "block";
        chart.style.width = "100%";
        chart.style.height = "100%";
        if (timeFrame) chart.setAttribute("time-frame", timeFrame);
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
  }, [timeFrame]);

  return (
    <div className="relative h-[280px] w-full overflow-hidden rounded-[18px] bg-[#050507] md:h-[340px]">
      <div ref={containerRef} className="h-full w-full" />
      {status !== "ready" && <ChartStatusOverlay message={status === "error" ? "Chart will be back online ASAP" : "Loading live chart..."} />}
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
          <span className={["shrink-0 text-lg text-slate-300 transition-transform duration-300", isOpen ? "rotate-90" : "rotate-0"].join(" ")}>&gt;</span>
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
      whileHover={{ y: -6, scale: 1.01 }}
      transition={{ type: "spring", stiffness: 260, damping: 20 }}
      className="price-surface group rounded-3xl p-5 md:p-6"
    >
      <RadialBackdrop />
      <div className="price-surface-content">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-3xl font-semibold tracking-tight text-slate-50 transition-colors duration-300 group-hover:text-white">Brent Oil Price</p>
          
          </div>
          <button className="price-widget-chip rounded-xl border px-3 py-2 text-sm font-medium text-violet-400 transition duration-300">1D</button>
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
    question: "What is Brent crude and why is it a global benchmark?",
    answer: "Brent crude is a widely used benchmark for pricing global oil. It's especially important for Europe, Africa, and much of Asia, and is commonly referenced in news headlines and institutional pricing models.",
  },
  {
    question: "What factors move the Brent oil price today?",
    answer: "Brent prices are influenced by supply and demand expectations, OPEC+ policy, geopolitical risk and shipping disruptions, inventory data, refinery demand, global growth expectations, and the US dollar. Because oil is a globally transported commodity, changes in logistics and risk premia can matter as much as pure consumption trends.",
  },
  {
    question: "Why can the Brent oil price differ between websites or brokers?",
    answer: "Different platforms may show different instruments. Some display a Brent futures contract, others show a CFD or a spot reference, and prices can vary by contract month (front-month vs next-month) and how rollovers are handled. Broker quotes also include spreads, which can widen during volatility or outside peak liquidity.",
  },
];

export default function OilPriceTodayPage() {
  const marketContext = useMarketContext("oil");
  const dxy = useDxy();
  const [selectedRange, setSelectedRange] = useState("1D");
  const [openFaq, setOpenFaq] = useState(-1);
  const activeLargeChartTab = LARGE_CHART_TABS.find((t) => t.value === selectedRange) ?? LARGE_CHART_TABS[0];

  return (
    <div className="min-h-screen bg-[#020203] text-slate-100">
      <PricePageBrandStyles theme="oil" />
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
              <h1 className="mt-4 text-4xl font-semibold tracking-tight text-slate-50 md:text-6xl">Oil Price Today</h1>
              <p className="mt-4 text-xl text-slate-300">Live Brent crude price with market insights</p>
              <div className="mt-7 space-y-4 text-[15px] leading-relaxed text-slate-200/90 md:max-w-xl">
                <p>Stay informed with the latest Brent crude price. Below is the live Brent oil chart, along with market analysis and the main forces influencing oil today.</p>
              </div>
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
              {marketContext?.heading ?? "What\u2019s moving oil today"}
            </h2>
            <div className="mt-5 max-w-4xl space-y-4 text-[15px] leading-relaxed text-slate-200/90">
              {marketContext ? (
                marketContext.paragraphs.map((p, i) => <p key={i}>{p.text}</p>)
              ) : (
                <>
                  <p>Oil is being shaped by supply expectations, global demand outlook, and evolving geopolitical risk across energy markets. Traders are mainly watching OPEC+ signals, inventories, and shipping headlines.</p>
                  <p>If supply risks remain elevated while demand holds steady, oil can stay supported. A stronger dollar, however, can pressure momentum and cap short-term gains.</p>
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
                <p className="price-eyebrow text-[11px] font-semibold uppercase tracking-[0.28em]">Price Chart</p>
                <h2 className="text-3xl font-semibold tracking-tight text-slate-50">Live chart view</h2>
                <div className="flex flex-wrap gap-2">
                  {LARGE_CHART_TABS.map((tab) => (
                    <button key={tab.value} type="button" onClick={() => setSelectedRange(tab.value)} className={getChartTabClassName(tab.value === selectedRange, "oil")}>{tab.label}</button>
                  ))}
                </div>
              </div>
            </div>
            <div className="price-chart-shell mt-6 rounded-2xl p-4"><TradingViewMiniChart timeFrame={activeLargeChartTab.timeFrame} /></div>
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
            <p className="price-eyebrow text-[11px] font-semibold uppercase tracking-[0.28em]">What Moves Oil</p>
            <h2 className="mt-4 text-3xl font-semibold tracking-tight text-slate-50">Market relationships</h2>
            <div className="mt-6 grid gap-4 md:grid-cols-2">
              <DriverCard title="US Dollar Index (DXY)" value={dxy ?? "—"} subtle="A softer dollar can support Brent prices." />
              <DriverCard title="OPEC+ / Supply expectations" value="—" subtle="Policy and output guidance can reprice supply risk." />
              <DriverCard title="Inventories" value="—" subtle="Stockpile trends influence near-term balance." />
              <DriverCard title="Risk / Geopolitics" value="—" subtle="Geopolitical events can add risk premium quickly." />
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
              <h2 className="mt-4 text-3xl font-semibold tracking-tight text-slate-50">Oil price questions</h2>
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
              <h2 className="mt-4 text-3xl font-semibold tracking-tight text-slate-50">How oil prices are calculated</h2>
              <div className="mt-5 space-y-4 text-[15px] leading-relaxed text-slate-200/90">
                <p>The Brent crude chart on this page is sourced from TradingView and reflects the front-month Brent futures contract. A live numeric price feed for oil is not currently available on this page — use the chart above for current price tracking.</p>
                <p>Since Brent can be represented via different instruments (spot references, futures, or broker quotes) and contract timing, small differences versus other platforms can occur due to spreads, refresh rates, and contract selection. This page is designed for market tracking, not as an exact tradable quote.</p>
              </div>
            </div>
          </div>
        </motion.section>

      </div>
    </div>
  );
}
