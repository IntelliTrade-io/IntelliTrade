"use client";

import React, { useEffect, useState } from "react";
import { BarChart3, NotebookPen, ShieldCheck, Target, TrendingDown, TrendingUp } from "lucide-react";
import { createJournalDemoFixtures } from "../generated/journalFixtures.ts";

const NAV_ITEMS = [
  { id: "overview", part: "01", title: "Overview", href: "#overview" },
  { id: "performance", part: "02", title: "Performance", href: "#performance" },
  { id: "trades", part: "03", title: "Trades", href: "#trades" },
  { id: "roadmap", part: "04", title: "Rollout", href: "#roadmap" },
];

const UTILITY_STATS = [
  { label: "Scope", value: "Journal MVP" },
  { label: "UI mode", value: "Macro Mastery" },
  { label: "Access", value: "Preview fixtures" },
];

const PANEL = "relative isolate overflow-hidden rounded-[28px] border border-[rgba(197,213,255,0.12)] shadow-[0_28px_90px_rgba(0,0,0,0.45)] backdrop-blur-[18px]";
const PANEL_STRONG = "border-[rgba(167,139,250,0.18)]";
const PANEL_BG = "pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(255,255,255,0.06),transparent_38%),linear-gradient(180deg,rgba(12,18,28,0.86),rgba(10,16,24,0.70))]";
const PANEL_GLOW = "pointer-events-none absolute inset-0 bg-[linear-gradient(135deg,rgba(139,92,246,0.08),transparent_34%,rgba(167,139,250,0.08))]";
const PANEL_RADIAL = "pointer-events-none absolute inset-0 opacity-0";
const CHIP = "inline-flex items-center rounded-full border border-white/10 bg-white/[0.05] px-4 py-2 text-[11px] uppercase tracking-[0.2em] text-white/78";

function cx(...parts) {
  return parts.filter(Boolean).join(" ");
}

function sum(items, selector) {
  return items.reduce((total, item) => total + selector(item), 0);
}

function weightedAverage(items) {
  const qty = sum(items, (item) => item.qty);
  return qty ? sum(items, (item) => item.qty * item.price) / qty : null;
}

function formatCurrency(value) {
  return value == null || Number.isNaN(value) ? "--" : `${value >= 0 ? "+" : ""}${value.toFixed(2)}`;
}

function formatR(value) {
  return value == null || Number.isNaN(value) ? "--" : `${value >= 0 ? "+" : ""}${value.toFixed(2)}R`;
}

function formatNumber(value) {
  return value == null || Number.isNaN(value) ? "--" : value.toFixed(2);
}

function formatDate(value) {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(new Date(value));
}

function formatDateTime(value) {
  const date = new Date(value);
  return {
    date: new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(date),
    time: new Intl.DateTimeFormat("en-US", { hour: "2-digit", minute: "2-digit" }).format(date),
  };
}

function buildSnapshot() {
  const fixtures = createJournalDemoFixtures("dashboard-preview");
  const instruments = new Map(fixtures.instruments.map((item) => [item.id, item]));
  const strategies = new Map(fixtures.strategies.map((item) => [item.id, item]));
  const legsByTrade = fixtures.tradeLegs.reduce((map, leg) => {
    if (!map.has(leg.trade_id)) map.set(leg.trade_id, []);
    map.get(leg.trade_id).push(leg);
    return map;
  }, new Map());

  const trades = fixtures.trades.map((trade) => {
    const instrument = instruments.get(trade.instrument_id);
    const strategy = trade.strategy_id ? strategies.get(trade.strategy_id) : null;
    const legs = [...(legsByTrade.get(trade.id) ?? [])].sort((a, b) => a.executed_at.localeCompare(b.executed_at));
    const entrySide = trade.bias === "long" ? "buy" : "sell";
    const exitSide = trade.bias === "long" ? "sell" : "buy";
    const entries = legs.filter((leg) => leg.side === entrySide);
    const exits = legs.filter((leg) => leg.side === exitSide);
    const entryQty = sum(entries, (leg) => leg.qty);
    const exitQty = sum(exits, (leg) => leg.qty);
    const avgEntry = weightedAverage(entries);
    const avgExit = weightedAverage(exits);
    const priceDiff = avgEntry != null && avgExit != null ? (trade.bias === "long" ? avgExit - avgEntry : avgEntry - avgExit) : 0;
    const matchedQty = Math.min(entryQty, exitQty);
    const pnlNet = matchedQty > 0 ? priceDiff * matchedQty * (instrument?.contract_size ?? 1) - sum(legs, (leg) => Number(leg.fee ?? 0)) - sum(legs, (leg) => Number(leg.slippage ?? 0)) : 0;
    return {
      id: trade.id,
      symbol: instrument?.symbol ?? "Unknown",
      side: trade.bias ?? "long",
      strategy: strategy?.name ?? "Unassigned",
      setup: trade.setup ?? "Unlabeled",
      openedAt: trade.opened_at,
      closedAt: trade.closed_at ?? trade.opened_at,
      qty: entryQty || exitQty || 0,
      avgEntry,
      avgExit,
      pnlNet,
      resolution: exitQty === 0 ? "open" : exitQty < entryQty ? "partially_closed" : "closed",
      r: trade.risk_per_trade ? pnlNet / trade.risk_per_trade : null,
    };
  }).sort((a, b) => b.openedAt.localeCompare(a.openedAt));

  const resolved = [...trades].filter((trade) => trade.resolution !== "open").sort((a, b) => a.closedAt.localeCompare(b.closedAt));
  let running = 0;
  const equity = resolved.map((trade) => {
    running += trade.pnlNet;
    return { label: formatDate(trade.closedAt), value: Number(running.toFixed(2)) };
  });
  const resolvedWithRisk = resolved.filter((trade) => trade.r != null);

  return {
    trades,
    equity,
    stats: {
      total: trades.length,
      closed: trades.filter((trade) => trade.resolution === "closed").length,
      partial: trades.filter((trade) => trade.resolution === "partially_closed").length,
      open: trades.filter((trade) => trade.resolution === "open").length,
      netClosed: Number(resolved.reduce((total, trade) => total + trade.pnlNet, 0).toFixed(2)),
      avgR: resolvedWithRisk.length ? Number((resolvedWithRisk.reduce((total, trade) => total + trade.r, 0) / resolvedWithRisk.length).toFixed(2)) : null,
    },
  };
}

const SNAPSHOT = buildSnapshot();

function useScrollProgress() {
  const [progress, setProgress] = useState(0);
  useEffect(() => {
    const onScroll = () => {
      const total = document.documentElement.scrollHeight - window.innerHeight;
      setProgress(total > 0 ? Math.min(Math.max(window.scrollY / total, 0), 1) : 0);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  return progress;
}

function GlassPanel({ children, className = "", bodyClassName = "", id, strong = false }) {
  return (
    <section id={id} className={cx(PANEL, strong && PANEL_STRONG, className)}>
      <div className={PANEL_BG} />
      <div className={PANEL_GLOW} />
      <div className={PANEL_RADIAL} />
      <div className={cx("relative z-10 p-6 md:p-7", bodyClassName)}>{children}</div>
    </section>
  );
}

function SectionHeader({ kicker, title, description, actions }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div className="grid gap-3">
        {kicker ? <div className="inline-flex w-fit items-center rounded-full border border-[rgba(197,213,255,0.12)] bg-[linear-gradient(135deg,rgba(139,92,246,0.12),rgba(167,139,250,0.08))] px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.22em] text-white">{kicker}</div> : null}
        <h2 className="text-[clamp(1.6rem,2.6vw,2.5rem)] font-semibold tracking-[-0.04em] text-[rgba(244,248,252,0.94)]">{title}</h2>
        {description ? <p className="max-w-3xl text-[0.96rem] leading-relaxed text-[rgba(203,215,228,0.7)]">{description}</p> : null}
      </div>
      {actions ? <div>{actions}</div> : null}
    </div>
  );
}

function Divider() {
  return <div className="h-px bg-[linear-gradient(90deg,rgba(139,92,246,0.12),rgba(197,213,255,0.05),rgba(167,139,250,0.12))]" />;
}

function Sparkline({ points, compact = false }) {
  if (!points.length) return <div className="flex h-full min-h-[180px] items-center justify-center text-sm text-[rgba(203,215,228,0.7)]">No realized equity points are available yet.</div>;
  const width = 780, height = compact ? 180 : 280, pad = 18;
  const values = points.map((point) => point.value);
  const min = Math.min(...values), max = Math.max(...values), range = max - min || 1;
  const coords = points.map((point, index) => {
    const x = pad + (index / Math.max(points.length - 1, 1)) * (width - pad * 2);
    const y = height - pad - ((point.value - min) / range) * (height - pad * 2);
    return `${x},${y}`;
  });
  const area = [`M ${pad},${height - pad}`, ...coords.map((pair) => `L ${pair}`), `L ${width - pad},${height - pad}`, "Z"].join(" ");
  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="h-full w-full">
      <defs><linearGradient id="journal-fill" x1="0%" y1="0%" x2="0%" y2="100%"><stop offset="0%" stopColor="rgba(139,92,246,0.08)" /><stop offset="100%" stopColor="rgba(139,92,246,0.02)" /></linearGradient></defs>
      <rect width={width} height={height} fill="rgba(255,255,255,0.02)" rx="24" />
      <path d={area} fill="url(#journal-fill)" />
      <polyline fill="none" stroke="rgba(139,92,246,0.9)" strokeWidth="3" points={coords.join(" ")} />
    </svg>
  );
}

function MetricCard({ icon: Icon, label, value, hint, tone = "neutral" }) {
  return (
    <GlassPanel as="article" bodyClassName="grid gap-3 p-5">
      <div className="flex items-start justify-between gap-3">
        <span className="text-[0.68rem] font-extrabold uppercase tracking-[0.24em] text-[rgba(204,191,235,0.58)]">{label}</span>
        <div className="flex h-10 w-10 items-center justify-center rounded-[16px] border border-[rgba(197,213,255,0.12)] bg-[linear-gradient(180deg,rgba(255,255,255,0.08),transparent_100%),linear-gradient(135deg,rgba(139,92,246,0.04),rgba(167,139,250,0.08))] text-white/78"><Icon className="h-4 w-4" /></div>
      </div>
      <span className={cx("text-[clamp(1.5rem,2vw,2rem)] font-semibold tracking-[-0.04em]", tone === "positive" ? "text-[#73f8bd]" : tone === "negative" ? "text-[#ff8d96]" : "text-white")}>{value}</span>
      {hint ? <span className="text-sm leading-relaxed text-[rgba(176,191,209,0.52)]">{hint}</span> : null}
    </GlassPanel>
  );
}

function PerformanceSection({ compact = false }) {
  const { equity, stats, trades } = SNAPSHOT;
  if (compact) return (
    <div className="flex h-full min-h-0 flex-col gap-4 overflow-auto">
      <div className="grid gap-3 sm:grid-cols-3">
        <MetricCard icon={TrendingUp} label="Net closed" value={formatCurrency(stats.netClosed)} tone={stats.netClosed >= 0 ? "positive" : "negative"} hint="Resolved fixture trades." />
        <MetricCard icon={Target} label="Average R" value={formatR(stats.avgR)} hint={`${stats.closed} closed trades`} />
        <MetricCard icon={NotebookPen} label="Trades" value={stats.total} hint={`${stats.open} open, ${stats.partial} partial`} />
      </div>
      <GlassPanel bodyClassName="p-4">
        <div className="flex items-end justify-between gap-3"><div><div className="text-[0.68rem] font-extrabold uppercase tracking-[0.24em] text-[rgba(204,191,235,0.58)]">Equity pulse</div><div className="mt-1 text-sm text-[rgba(203,215,228,0.7)]">Realized equity from the fixture trade set.</div></div><span className="inline-flex min-h-[28px] items-center justify-center rounded-full border border-[rgba(197,213,255,0.12)] bg-white/[0.05] px-3 text-[0.78rem] font-bold text-[rgba(244,248,252,0.94)]">Fixture data</span></div>
        <div className="mt-4 h-[180px] rounded-[22px] border border-[rgba(197,213,255,0.08)] bg-[rgba(255,255,255,0.028)] p-2"><Sparkline points={equity} compact /></div>
      </GlassPanel>
      <GlassPanel bodyClassName="p-4">
        <div className="text-[0.68rem] font-extrabold uppercase tracking-[0.24em] text-[rgba(204,191,235,0.58)]">Recent executions</div>
        <div className="mt-4 grid gap-2">{trades.slice(0, 4).map((trade) => <div key={trade.id} className="grid grid-cols-[1fr_auto] gap-3 rounded-[18px] border border-[rgba(197,213,255,0.08)] bg-[rgba(255,255,255,0.028)] px-3 py-3"><div><div className="font-semibold text-[rgba(244,248,252,0.94)]">{trade.symbol}</div><div className="mt-1 text-sm text-[rgba(176,191,209,0.52)]">{trade.strategy} . {formatDate(trade.openedAt)}</div></div><div className={trade.pnlNet >= 0 ? "font-semibold text-[#73f8bd]" : "font-semibold text-[#ff8d96]"}>{formatCurrency(trade.pnlNet)}</div></div>)}</div>
      </GlassPanel>
    </div>
  );
  return (
    <GlassPanel id="performance">
      <SectionHeader kicker="Performance" title="Overview and equity pulse" description="The current IntelliJournal route now follows the source project shell and hierarchy, while this preview still runs from the bundled fixture dataset." actions={<span className={CHIP}>Realized stats</span>} />
      <div className="mt-6"><Divider /></div>
      <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <MetricCard icon={NotebookPen} label="Total trades" value={stats.total} hint="All authenticated-style fixture trades in the local set." />
        <MetricCard icon={ShieldCheck} label="Closed trades" value={stats.closed} hint="Entry and exit quantity are fully matched." />
        <MetricCard icon={Target} label="Partial closes" value={stats.partial} hint="At least one exit exists, but some size remains open." />
        <MetricCard icon={BarChart3} label="Open trades" value={stats.open} hint="No exit legs have been recorded yet." />
        <MetricCard icon={stats.netClosed >= 0 ? TrendingUp : TrendingDown} label="Net PnL (closed)" value={formatCurrency(stats.netClosed)} tone={stats.netClosed >= 0 ? "positive" : "negative"} hint="Only fully closed trades are included here." />
        <MetricCard icon={Target} label="Average resolved R" value={formatR(stats.avgR)} hint="Closed and partially closed trades with risk defined." />
      </div>
      <div className="mt-6 rounded-[24px] border border-[rgba(197,213,255,0.08)] bg-[rgba(255,255,255,0.028)] p-4"><div className="text-[0.68rem] font-extrabold uppercase tracking-[0.24em] text-[rgba(204,191,235,0.58)]">Realized equity</div><div className="mt-4 h-[280px] rounded-[22px] border border-[rgba(197,213,255,0.08)] bg-[rgba(255,255,255,0.028)] p-3"><Sparkline points={equity} /></div></div>
      <GlassPanel className="mt-6" bodyClassName="grid gap-3 p-5"><div className="text-[0.68rem] font-extrabold uppercase tracking-[0.24em] text-[rgba(204,191,235,0.58)]">Calculation rules</div><ul className="m-0 list-disc space-y-2 pl-5 text-sm leading-relaxed text-[rgba(203,215,228,0.7)]"><li>Equity uses the full fixture trade set rather than only the visible table rows.</li><li>Closed trades contribute matched PnL net of fees and slippage.</li><li>Open and partially closed trades exclude unrealized mark-to-market.</li></ul></GlassPanel>
    </GlassPanel>
  );
}

function TradesSection() {
  const { trades } = SNAPSHOT;
  return (
    <GlassPanel id="trades">
      <SectionHeader kicker="Trades" title="Recent executions" description="Authenticated trades load here with direct access to detail, top-level editing, leg replacement, screenshots, and safe delete controls." actions={<button type="button" className="inline-flex min-h-[44px] items-center justify-center rounded-[16px] border border-[rgba(197,213,255,0.12)] bg-[linear-gradient(135deg,rgba(139,92,246,0.14),rgba(167,139,250,0.10))] px-4 text-sm font-semibold text-white shadow-[0_18px_50px_rgba(139,92,246,0.06)] transition hover:-translate-y-[1px]">Add trade</button>} />
      <div className="mt-6"><Divider /></div>
      <div className="mt-6 overflow-hidden rounded-[24px] border border-[rgba(197,213,255,0.08)] bg-[rgba(255,255,255,0.028)]"><div className="overflow-x-auto"><table className="w-full min-w-[880px] border-collapse"><thead><tr className="bg-white/[0.04] text-left text-[0.76rem] font-extrabold uppercase tracking-[0.2em] text-[rgba(206,217,230,0.68)]"><th className="px-4 py-4">Date</th><th className="px-4 py-4">Symbol</th><th className="px-4 py-4">Side</th><th className="px-4 py-4">Qty</th><th className="px-4 py-4">Avg Entry</th><th className="px-4 py-4">Avg Exit</th><th className="px-4 py-4">PnL (net)</th><th className="px-4 py-4">R</th><th className="px-4 py-4">Strategy</th></tr></thead><tbody>{trades.slice(0, 8).map((trade) => { const opened = formatDateTime(trade.openedAt); const long = trade.side === "long"; return <tr key={trade.id} className="border-t border-[rgba(197,213,255,0.06)] hover:bg-white/[0.035]"><td className="px-4 py-4 align-top text-[rgba(203,215,228,0.7)]"><div className="font-semibold text-[rgba(244,248,252,0.94)]">{opened.date}</div><div className="text-[0.88rem] text-[rgba(176,191,209,0.52)]">{opened.time}</div></td><td className="px-4 py-4 font-semibold text-[rgba(244,248,252,0.94)]">{trade.symbol}</td><td className="px-4 py-4"><span className={cx("inline-flex min-h-[28px] items-center justify-center rounded-full border px-3 text-[0.78rem] font-bold uppercase", long ? "border-[rgba(115,248,189,0.22)] bg-[rgba(115,248,189,0.08)] text-[rgba(199,255,230,0.94)]" : "border-[rgba(255,141,150,0.22)] bg-[rgba(255,141,150,0.08)] text-[rgba(255,220,222,0.94)]")}>{trade.side}</span></td><td className="px-4 py-4 text-[rgba(203,215,228,0.7)]">{formatNumber(trade.qty)}</td><td className="px-4 py-4 text-[rgba(203,215,228,0.7)]">{formatNumber(trade.avgEntry)}</td><td className="px-4 py-4 text-[rgba(203,215,228,0.7)]">{formatNumber(trade.avgExit)}</td><td className={cx("px-4 py-4 font-semibold", trade.pnlNet >= 0 ? "text-[#73f8bd]" : "text-[#ff8d96]")}>{formatCurrency(trade.pnlNet)}</td><td className="px-4 py-4 text-[rgba(203,215,228,0.7)]">{formatR(trade.r)}</td><td className="px-4 py-4"><span className="inline-flex min-h-[28px] items-center justify-center rounded-full border border-[rgba(197,213,255,0.12)] bg-white/[0.05] px-3 text-[0.78rem] font-bold text-[rgba(244,248,252,0.94)]">{trade.strategy}</span></td></tr>; })}</tbody></table></div></div>
      <div className="mt-5 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"><div className="text-[0.92rem] text-[rgba(176,191,209,0.52)]">Page 1 of 1 | {trades.length} total trades</div><div className="flex gap-3"><button type="button" disabled className="inline-flex min-h-[44px] items-center justify-center rounded-[16px] border border-[rgba(197,213,255,0.12)] bg-white/[0.05] px-4 text-sm text-[rgba(244,248,252,0.94)] opacity-45">Previous</button><button type="button" disabled className="inline-flex min-h-[44px] items-center justify-center rounded-[16px] border border-[rgba(197,213,255,0.12)] bg-white/[0.05] px-4 text-sm text-[rgba(244,248,252,0.94)] opacity-45">Next</button></div></div>
    </GlassPanel>
  );
}

function OverviewSection() {
  return (
    <GlassPanel id="overview" strong>
      <SectionHeader kicker="IntelliTrade" title="Trading journal workspace" description="The approved Macro Mastery visual language is now wired into the real Next.js journal shell, protected routes, and reusable feature surfaces rather than living only in the prototype reference." actions={<span className={CHIP}>App Router + Supabase + typed APIs</span>} />
      <div className="mt-6"><Divider /></div>
      <div className="mt-6 grid gap-4 md:grid-cols-3">
        <MetricCard icon={NotebookPen} label="Current state" value="Journal MVP" hint="Core journal routes cover trades, detail, realized stats, review flows, exports, and screenshots in the source project." />
        <MetricCard icon={ShieldCheck} label="Foundation fix" value="Providers wired" hint="React Query is now supported from the root app shell." />
        <MetricCard icon={TrendingUp} label="Visual target" value="Macro Mastery" hint="Black glass surfaces, restrained purple accents, sticky nav, and progress affordance." />
      </div>
    </GlassPanel>
  );
}

function RoadmapSection() {
  return (
    <GlassPanel id="roadmap">
      <SectionHeader kicker="Current boundaries" title="What is live and what is still narrow" description="The route structure is stable. Remaining gaps are mostly around deeper workflow controls, richer reporting, and environment confirmation." />
      <div className="mt-6"><Divider /></div>
      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <GlassPanel bodyClassName="grid gap-3 p-5"><span className="text-[0.68rem] font-extrabold uppercase tracking-[0.24em] text-[rgba(204,191,235,0.58)]">Live journal flows</span><p className="m-0 text-sm leading-relaxed text-[rgba(203,215,228,0.7)]">Add-trade, trade detail, top-level trade edits, leg replacement, screenshot upload, reviews, and exports now run through protected user-scoped flows in the source journal.</p><ul className="m-0 list-disc space-y-2 pl-5 text-sm leading-relaxed text-[rgba(203,215,228,0.7)]"><li>User-scoped routes</li><li>Explicit loading, empty, and error states</li><li>Shared journal types and helper modules</li></ul></GlassPanel>
        <GlassPanel bodyClassName="grid gap-3 p-5"><span className="text-[0.68rem] font-extrabold uppercase tracking-[0.24em] text-[rgba(204,191,235,0.58)]">Remaining limits</span><p className="m-0 text-sm leading-relaxed text-[rgba(203,215,228,0.7)]">Cookie-backed auth guards and SSR session refresh are in place in the source project. The remaining work is feature depth and environment confirmation, not rebuilding auth or the journal shell.</p><ul className="m-0 list-disc space-y-2 pl-5 text-sm leading-relaxed text-[rgba(203,215,228,0.7)]"><li>Delete cleanup and leg replacement are best-effort, not transactional</li><li>Review and export contracts stay intentionally narrow</li><li>Bucket policies and final go-live checks still need human confirmation</li></ul></GlassPanel>
      </div>
    </GlassPanel>
  );
}

export function IntelliJournalSurface({ compact = false }) {
  return <PerformanceSection compact={compact} />;
}

export default function IntelliJournalPage() {
  const progress = useScrollProgress();
  return (
    <div className="relative min-h-screen overflow-hidden bg-[linear-gradient(180deg,#05080d_0%,#09111b_45%,#05080d_100%)] text-[rgba(244,248,252,0.94)]">
      <div aria-hidden className="fixed inset-x-0 top-0 z-40 h-1 bg-white/[0.03]"><div className="h-full origin-left bg-[linear-gradient(90deg,rgb(139,92,246),rgb(167,139,250),rgb(139,92,246))] shadow-[0_0_24px_rgba(139,92,246,0.24)]" style={{ transform: `scaleX(${progress})` }} /></div>
      <div aria-hidden className="pointer-events-none fixed inset-0 z-0 overflow-hidden"><div className="absolute -left-28 top-[12%] h-[360px] w-[360px] rounded-full bg-[rgba(139,92,246,0.08)] blur-[80px]" /><div className="absolute -right-20 top-[10%] h-[320px] w-[320px] rounded-full bg-[rgba(167,139,250,0.10)] blur-[80px]" /><div className="absolute left-[22%] bottom-[-90px] h-[300px] w-[300px] rounded-full bg-[rgba(255,255,255,0.06)] blur-[80px]" /><svg className="absolute bottom-0 left-0 w-[min(52vw,760px)] opacity-45" viewBox="0 0 720 640" fill="none"><g stroke="rgba(208,221,255,0.15)" strokeWidth="1"><path d="M28 584L138 500L274 560L354 452L518 508L682 372" /><path d="M68 640L152 534L254 594L360 516L474 564L612 476" /><path d="M112 460L208 386L300 430L402 332L536 372L646 282" /><path d="M24 520L112 460L208 386L248 270L384 204L534 232L652 146" /><path d="M248 270L286 136L414 92L546 132L690 88" /></g></svg></div>
      <div className="relative z-10 mx-auto max-w-[1400px] px-5 pb-20 pt-32 lg:px-8">
        <div className="grid gap-7 xl:grid-cols-[300px_minmax(0,1fr)]">
          <aside className="hidden xl:block"><div className="sticky top-24 grid gap-5"><div className="grid gap-3"><div className="inline-flex w-fit items-center gap-2 rounded-full border border-[rgba(167,139,250,0.16)] bg-white/[0.035] px-4 py-2 text-[0.72rem] font-extrabold uppercase tracking-[0.24em] text-[rgba(229,223,247,0.8)]"><span className="h-2 w-2 rounded-full bg-[linear-gradient(135deg,rgb(139,92,246),rgb(167,139,250))] shadow-[0_0_12px_rgba(139,92,246,0.36)]" />Private logbook</div><h1 className="text-[clamp(2.2rem,4vw,3.6rem)] font-semibold leading-[0.95] tracking-[-0.05em] text-white">IntelliJournal</h1><p className="max-w-[22rem] text-[0.98rem] leading-relaxed text-[rgba(203,215,228,0.7)]">Protected trading journal workspace for IntelliTrade. The approved Macro Mastery visual language now runs through reusable production components instead of the old prototype file.</p></div>
            <GlassPanel bodyClassName="p-5"><nav className="grid gap-3">{NAV_ITEMS.map((item) => <a key={item.id} className="flex items-center gap-3 rounded-[20px] border border-transparent bg-white/[0.035] px-3.5 py-3 text-[rgba(203,215,228,0.7)] transition hover:-translate-y-[1px] hover:border-[rgba(173,187,255,0.18)] hover:bg-white/[0.06] hover:text-[rgba(244,248,252,0.94)]" href={item.href}><span className="grid h-10 w-10 place-items-center rounded-[16px] border border-[rgba(197,213,255,0.12)] bg-[linear-gradient(180deg,rgba(255,255,255,0.08),transparent_100%),linear-gradient(135deg,rgba(139,92,246,0.04),rgba(167,139,250,0.08))]"><span className="h-3 w-3 rounded-full bg-[linear-gradient(135deg,rgb(139,92,246),rgb(167,139,250))] shadow-[0_0_18px_rgba(139,92,246,0.28)]" /></span><span className="grid gap-[3px]"><span className="text-[0.63rem] font-extrabold uppercase tracking-[0.25em] text-[rgba(204,191,235,0.58)]">{item.part}</span><span className="text-[0.93rem] font-bold text-inherit">{item.title}</span></span></a>)}</nav></GlassPanel>
            <GlassPanel strong bodyClassName="p-5"><div className="grid gap-3">{UTILITY_STATS.map((stat) => <div key={stat.label} className="flex items-center justify-between gap-4 text-[0.94rem] text-[rgba(203,215,228,0.7)]"><span>{stat.label}</span><span className="font-bold text-[rgba(244,248,252,0.94)]">{stat.value}</span></div>)}</div><div className="my-[18px]"><Divider /></div><button type="button" className="inline-flex min-h-[44px] w-full items-center justify-center rounded-[16px] border border-[rgba(197,213,255,0.12)] bg-white/[0.05] px-4 text-sm text-[rgba(244,248,252,0.94)]">Preview shell</button></GlassPanel></div></aside>
          <main className="grid min-w-0 gap-6"><div className="sticky top-3 z-20 flex gap-2 overflow-x-auto rounded-full border border-[rgba(197,213,255,0.12)] bg-[rgba(3,7,13,0.72)] p-1.5 backdrop-blur-[18px] xl:hidden">{NAV_ITEMS.map((item) => <a key={item.id} href={item.href} className="inline-flex flex-none items-center gap-2 rounded-full bg-white/[0.035] px-3 py-2 text-sm text-[rgba(203,215,228,0.7)] transition hover:bg-white/[0.06] hover:text-[rgba(244,248,252,0.94)]"><span className="h-2 w-2 rounded-full bg-[linear-gradient(135deg,rgb(232,121,249),rgb(139,92,246))]" />{item.title}</a>)}</div><OverviewSection /><PerformanceSection /><TradesSection /><RoadmapSection /></main>
        </div>
      </div>
    </div>
  );
}