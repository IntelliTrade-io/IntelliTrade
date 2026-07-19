"use client";

import { useEffect, useState, useCallback } from "react";
import { RefreshCw, Plus, Trash2, X } from "lucide-react";
import { apiGet, apiPost, apiPatch, apiDelete, ApiError } from "@/lib/api/client";
import {
  remainingOpenQty,
  tradeStatus,
  type JournalTrade,
  type JournalTradeLeg,
  type TradeStatus,
  type TradeBias,
  type RealizedStats,
} from "@/lib/journal-trades";
import { WidgetShell } from "../ui/widget-shell";
import { IconAction, PanelActions } from "../ui/panel-actions";
import type { Panel } from "../types";

// ─── Types ──────────────────────────────────────────────────────────────────

/** A trade as returned by GET /api/journal (domain trade + server-computed
 *  status/PnL). */
type ClientTrade = JournalTrade & { status: TradeStatus; netPnl: number };

interface JournalResponse {
  trades: ClientTrade[];
  stats: RealizedStats;
  canEdit: boolean;
}

/** A leg as sent to the leg-replacement endpoint (fee optional → defaults 0). */
interface LegPayload {
  side: "buy" | "sell";
  qty: number;
  price: number;
  fee?: number;
  executedAt?: string;
}

// ─── Pure formatting / parsing helpers ──────────────────────────────────────

/** Comma-separated tag string → trimmed, non-empty tags (API de-dupes/limits). */
function parseTags(raw: string): string[] {
  return raw
    .split(",")
    .map((t) => t.trim())
    .filter((t) => t.length > 0);
}

/** Signed realized PnL, 2 decimals, no currency symbol; collapses -0.00 → 0.00. */
function fmtPnl(n: number): string {
  const v = Math.abs(n) < 0.005 ? 0 : n;
  return `${v >= 0 ? "+" : ""}${v.toFixed(2)}`;
}

/** Score with an explicit sign, rounded to an integer (matches the meters). */
function fmtScore(n: number): string {
  return `${n >= 0 ? "+" : ""}${Math.round(n)}`;
}

/** Compact "Jul 19" date. */
function fmtDay(ts: string): string {
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
}

const asNum = (v: unknown): number | null =>
  typeof v === "number" && Number.isFinite(v) ? v : null;
const asStr = (v: unknown): string | null =>
  typeof v === "string" && v.length > 0 ? v : null;
const asObj = (v: unknown): Record<string, unknown> | null =>
  typeof v === "object" && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : null;

/**
 * Build the one-line "what the meters read at entry" summary from a trade's
 * opaque context stamp. Every field is optional; a bare stamp yields null and
 * the caller omits the line entirely. Never throws.
 */
function contextLine(ctx: Record<string, unknown> | null | undefined): string | null {
  if (!ctx) return null;
  const parts: string[] = [];

  const daily = asObj(ctx.daily);
  if (daily) {
    const base = asObj(daily.base);
    const quote = asObj(daily.quote);
    const bCode = base && asStr(base.code);
    const bScore = base && asNum(base.score);
    const qCode = quote && asStr(quote.code);
    const qScore = quote && asNum(quote.score);
    if (bCode && bScore !== null && qCode && qScore !== null) {
      const bRank = base && asNum(base.rank);
      const qRank = quote && asNum(quote.rank);
      parts.push(
        `${bCode} ${fmtScore(bScore)}${bRank !== null ? ` (#${bRank})` : ""} vs ` +
          `${qCode} ${fmtScore(qScore)}${qRank !== null ? ` (#${qRank})` : ""}`,
      );
    }
    const dp = asObj(daily.pair);
    const dpState = dp && asStr(dp.state);
    if (dpState) {
      const conf = dp && asNum(dp.confidence);
      parts.push(`daily ${dpState}${conf !== null ? ` ${conf}` : ""}`);
    }
  }

  const intraday = asObj(ctx.intraday);
  if (intraday) {
    const ip = asObj(intraday.pair);
    const ipState = ip && asStr(ip.state);
    if (ipState) {
      const conf = ip && asNum(ip.confidence);
      parts.push(`intraday ${ipState}${conf !== null ? ` ${conf}` : ""}`);
    }
  }

  const zone = asObj(ctx.zone);
  if (zone) {
    const grade = asStr(zone.grade);
    const status = asStr(zone.status);
    if (grade && status) parts.push(`zone ${grade} ${status}`);
  }

  return parts.length > 0 ? `At entry: ${parts.join(" · ")}` : null;
}

const CONTEXT_TITLE =
  "Captured from IntelliTrade's own meters at entry time — measurement, not a recommendation.";

// ─── Small styled primitives (house palette) ────────────────────────────────

const INPUT_CLASS =
  "h-9 w-full rounded-[12px] border border-white/10 bg-white/[0.035] px-3 text-sm text-white placeholder:text-white/25 outline-none transition-all focus:border-violet-400/22 focus:bg-white/[0.05]";

function Kicker({ children }: { children: React.ReactNode }) {
  return <div className="text-[9px] uppercase tracking-[0.18em] text-white/40">{children}</div>;
}

function StatTile({ label, value, tone }: { label: string; value: string; tone?: "pos" | "neg" }) {
  const valueColor = tone === "pos" ? "text-emerald-200/90" : tone === "neg" ? "text-red-200/90" : "text-white";
  return (
    <div className="rounded-[16px] border border-white/8 bg-white/[0.03] px-3 py-2">
      <div className="text-[9px] uppercase tracking-[0.16em] text-white/34">{label}</div>
      <div className={`mt-0.5 text-sm font-semibold leading-tight ${valueColor}`}>{value}</div>
    </div>
  );
}

function BiasChip({ bias }: { bias: TradeBias }) {
  const cls =
    bias === "long"
      ? "border-emerald-400/20 bg-emerald-500/10 text-emerald-200"
      : "border-red-400/20 bg-red-500/10 text-red-200";
  return (
    <span className={`inline-flex h-5 items-center rounded-full border px-2 text-[9px] font-bold uppercase tracking-wider ${cls}`}>
      {bias === "long" ? "Long" : "Short"}
    </span>
  );
}

const STATUS_CLASS: Record<TradeStatus, string> = {
  open: "border-sky-400/20 bg-sky-500/10 text-sky-200",
  partial: "border-amber-400/20 bg-amber-500/10 text-amber-200",
  closed: "border-white/10 bg-white/[0.05] text-white/55",
};

function StatusChip({ status }: { status: TradeStatus }) {
  return (
    <span className={`inline-flex h-5 items-center rounded-full border px-2 text-[9px] font-bold uppercase tracking-wider ${STATUS_CLASS[status]}`}>
      {status}
    </span>
  );
}

// ─── Log-trade form ─────────────────────────────────────────────────────────

function LogTradeForm({ onCreated, onCancel }: { onCreated: () => void; onCancel: () => void }) {
  const [symbol, setSymbol] = useState("");
  const [bias, setBias] = useState<TradeBias>("long");
  const [price, setPrice] = useState("");
  const [qty, setQty] = useState("");
  const [fee, setFee] = useState("");
  const [setup, setSetup] = useState("");
  const [tags, setTags] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const priceNum = Number(price);
    const qtyNum = Number(qty);
    const feeNum = fee.trim() === "" ? undefined : Number(fee);

    // Light UX validation only — the API is authoritative.
    if (symbol.trim().length === 0) return setError("Symbol is required.");
    if (!Number.isFinite(priceNum) || priceNum <= 0) return setError("Entry price must be a positive number.");
    if (!Number.isFinite(qtyNum) || qtyNum <= 0) return setError("Quantity must be a positive number.");
    if (feeNum !== undefined && (!Number.isFinite(feeNum) || feeNum < 0)) return setError("Fee must be zero or more.");

    const leg: LegPayload = { side: bias === "long" ? "buy" : "sell", qty: qtyNum, price: priceNum };
    if (feeNum !== undefined) leg.fee = feeNum;

    setSubmitting(true);
    try {
      await apiPost("/api/journal", {
        symbol: symbol.trim().toUpperCase(),
        bias,
        setup: setup.trim() || null,
        tags: parseTags(tags),
        legs: [leg],
      });
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save trade.");
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={submit} className="rounded-[1.35rem] border border-white/[0.07] bg-white/[0.02] p-3">
      <div className="grid grid-cols-2 gap-2">
        <label className="col-span-2 sm:col-span-1">
          <span className="mb-1 block text-[9px] uppercase tracking-[0.16em] text-white/38">Symbol</span>
          <input
            className={INPUT_CLASS}
            value={symbol}
            onChange={(e) => setSymbol(e.target.value.toUpperCase())}
            maxLength={15}
            placeholder="EURUSD"
            inputMode="text"
          />
        </label>
        <div className="col-span-2 sm:col-span-1">
          <span className="mb-1 block text-[9px] uppercase tracking-[0.16em] text-white/38">Bias</span>
          <div className="flex h-9 rounded-[12px] border border-white/10 bg-white/[0.035] p-0.5">
            {(["long", "short"] as const).map((b) => (
              <button
                key={b}
                type="button"
                onClick={() => setBias(b)}
                className={`flex-1 rounded-[10px] text-[11px] font-bold uppercase tracking-wider transition-all ${
                  bias === b
                    ? b === "long"
                      ? "bg-emerald-500/15 text-emerald-200"
                      : "bg-red-500/15 text-red-200"
                    : "text-white/45 hover:text-white/70"
                }`}
              >
                {b}
              </button>
            ))}
          </div>
        </div>
        <label>
          <span className="mb-1 block text-[9px] uppercase tracking-[0.16em] text-white/38">Entry price</span>
          <input className={INPUT_CLASS} value={price} onChange={(e) => setPrice(e.target.value)} inputMode="decimal" placeholder="1.0850" />
        </label>
        <label>
          <span className="mb-1 block text-[9px] uppercase tracking-[0.16em] text-white/38">Quantity (qty)</span>
          <input className={INPUT_CLASS} value={qty} onChange={(e) => setQty(e.target.value)} inputMode="decimal" placeholder="1" />
        </label>
        <label>
          <span className="mb-1 block text-[9px] uppercase tracking-[0.16em] text-white/38">Fee (optional)</span>
          <input className={INPUT_CLASS} value={fee} onChange={(e) => setFee(e.target.value)} inputMode="decimal" placeholder="0" />
        </label>
        <label>
          <span className="mb-1 block text-[9px] uppercase tracking-[0.16em] text-white/38">Setup (optional)</span>
          <input className={INPUT_CLASS} value={setup} onChange={(e) => setSetup(e.target.value)} maxLength={120} placeholder="Trend continuation" />
        </label>
        <label className="col-span-2">
          <span className="mb-1 block text-[9px] uppercase tracking-[0.16em] text-white/38">Tags (optional, comma-separated)</span>
          <input className={INPUT_CLASS} value={tags} onChange={(e) => setTags(e.target.value)} placeholder="breakout, london" />
        </label>
      </div>

      {error && <p className="mt-2 text-[11px] leading-snug text-red-300/90">{error}</p>}

      <div className="mt-3 flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="inline-flex h-8 items-center rounded-full border border-white/10 bg-black/30 px-3 text-[11px] font-semibold text-white/55 transition-all hover:border-white/20 hover:text-white/80"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={submitting}
          className="inline-flex h-8 items-center gap-1.5 rounded-full border border-violet-400/25 bg-violet-500/15 px-4 text-[11px] font-semibold text-violet-100 transition-all hover:bg-violet-500/20 disabled:opacity-50"
        >
          {submitting ? <RefreshCw className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
          Log trade
        </button>
      </div>
    </form>
  );
}

// ─── Close mini-form ─────────────────────────────────────────────────────────

function CloseForm({ trade, onDone, onCancel }: { trade: ClientTrade; onDone: () => void; onCancel: () => void }) {
  const remaining = remainingOpenQty(trade.bias, trade.legs);
  const [exitPrice, setExitPrice] = useState("");
  const [exitQty, setExitQty] = useState(remaining > 0 ? String(remaining) : "");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const priceNum = Number(exitPrice);
    const qtyNum = Number(exitQty);
    if (!Number.isFinite(priceNum) || priceNum <= 0) return setError("Exit price must be a positive number.");
    if (!Number.isFinite(qtyNum) || qtyNum <= 0) return setError("Exit quantity must be a positive number.");

    // Full-replacement: existing legs (timing preserved) + the closing leg.
    const closingSide: "buy" | "sell" = trade.bias === "long" ? "sell" : "buy";
    const legs: LegPayload[] = trade.legs.map((l: JournalTradeLeg) => ({
      side: l.side,
      qty: l.qty,
      price: l.price,
      fee: l.fee,
      executedAt: l.executedAt,
    }));
    legs.push({ side: closingSide, qty: qtyNum, price: priceNum });

    setSubmitting(true);
    try {
      const { trade: updated } = await apiPost<{ trade: JournalTrade }>(`/api/journal/${trade.id}/legs`, { legs });
      // If the position is now flat, stamp the close time too.
      if (tradeStatus(updated.bias, updated.legs) === "closed") {
        await apiPatch(`/api/journal/${trade.id}`, { closed_at: new Date().toISOString() });
      }
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not close the trade.");
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={submit} className="mt-2 rounded-[14px] border border-white/[0.08] bg-black/25 p-2.5">
      <div className="grid grid-cols-2 gap-2">
        <label>
          <span className="mb-1 block text-[9px] uppercase tracking-[0.16em] text-white/38">Exit price</span>
          <input className={INPUT_CLASS} value={exitPrice} onChange={(e) => setExitPrice(e.target.value)} inputMode="decimal" placeholder="1.0920" />
        </label>
        <label>
          <span className="mb-1 block text-[9px] uppercase tracking-[0.16em] text-white/38">Qty (open {remaining})</span>
          <input className={INPUT_CLASS} value={exitQty} onChange={(e) => setExitQty(e.target.value)} inputMode="decimal" />
        </label>
      </div>
      {error && <p className="mt-2 text-[11px] leading-snug text-red-300/90">{error}</p>}
      <div className="mt-2 flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="inline-flex h-7 items-center rounded-full border border-white/10 bg-black/30 px-3 text-[10px] font-semibold text-white/55 transition-all hover:border-white/20 hover:text-white/80"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={submitting}
          className="inline-flex h-7 items-center gap-1.5 rounded-full border border-emerald-400/25 bg-emerald-500/12 px-3 text-[10px] font-semibold text-emerald-100 transition-all hover:bg-emerald-500/20 disabled:opacity-50"
        >
          {submitting && <RefreshCw className="h-3 w-3 animate-spin" />}
          Record close
        </button>
      </div>
    </form>
  );
}

// ─── Trade row ────────────────────────────────────────────────────────────────

function TradeRow({ trade, canEdit, onChanged }: { trade: ClientTrade; canEdit: boolean; onChanged: () => void }) {
  const [closing, setClosing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [rowError, setRowError] = useState<string | null>(null);

  const ctx = contextLine(trade.context);
  const showPnl = trade.status !== "open" && Math.abs(trade.netPnl) >= 0.005;
  const canClose = trade.status === "open" || trade.status === "partial";

  async function doDelete() {
    setRowError(null);
    setDeleting(true);
    try {
      await apiDelete(`/api/journal/${trade.id}`);
      onChanged();
    } catch (err) {
      setRowError(err instanceof Error ? err.message : "Could not delete the trade.");
      setDeleting(false);
      setConfirmDelete(false);
    }
  }

  return (
    <article className="rounded-[1.35rem] border border-white/[0.07] bg-[linear-gradient(180deg,rgba(11,12,15,0.9),rgba(9,10,13,0.92))] px-3 py-2.5">
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className="font-mono text-sm font-semibold text-white/90">{trade.symbol}</span>
          <BiasChip bias={trade.bias} />
          <StatusChip status={trade.status} />
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {showPnl && (
            <span
              className={`font-mono text-xs font-semibold ${trade.netPnl >= 0 ? "text-emerald-300/85" : "text-red-300/85"}`}
              title="Realized net PnL in quote-currency units (gross minus all fees)."
            >
              {fmtPnl(trade.netPnl)}
            </span>
          )}
          <span className="font-mono text-[10px] text-white/38">{fmtDay(trade.openedAt)}</span>
        </div>
      </div>

      {trade.setup && <div className="mt-1 text-[11px] leading-snug text-white/55">{trade.setup}</div>}

      {ctx && (
        <div className="mt-1 truncate text-[10px] leading-snug text-white/40" title={CONTEXT_TITLE}>
          {ctx}
        </div>
      )}

      {trade.tags.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1">
          {trade.tags.map((t) => (
            <span key={t} className="inline-flex items-center rounded-full border border-white/[0.08] bg-white/[0.03] px-1.5 py-px text-[9px] text-white/45">
              {t}
            </span>
          ))}
        </div>
      )}

      {canEdit && (
        <div className="mt-2 flex items-center gap-2">
          {canClose && !closing && (
            <button
              type="button"
              onClick={() => setClosing(true)}
              className="inline-flex h-7 items-center rounded-full border border-white/10 bg-black/30 px-3 text-[10px] font-semibold text-white/60 transition-all hover:border-emerald-400/25 hover:text-emerald-200"
            >
              Close
            </button>
          )}
          {!confirmDelete ? (
            <button
              type="button"
              onClick={() => setConfirmDelete(true)}
              className="inline-flex h-7 items-center gap-1 rounded-full border border-white/10 bg-black/30 px-3 text-[10px] font-semibold text-white/45 transition-all hover:border-red-400/25 hover:text-red-200"
            >
              <Trash2 className="h-3 w-3" />
              Delete
            </button>
          ) : (
            <span className="inline-flex items-center gap-1.5">
              <span className="text-[10px] text-white/50">Delete?</span>
              <button
                type="button"
                onClick={doDelete}
                disabled={deleting}
                className="inline-flex h-7 items-center rounded-full border border-red-400/30 bg-red-500/15 px-3 text-[10px] font-semibold text-red-100 transition-all hover:bg-red-500/25 disabled:opacity-50"
              >
                {deleting ? <RefreshCw className="h-3 w-3 animate-spin" /> : "Confirm"}
              </button>
              <button
                type="button"
                onClick={() => setConfirmDelete(false)}
                className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-white/10 bg-black/30 text-white/45 transition-all hover:text-white/80"
                aria-label="Cancel delete"
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          )}
        </div>
      )}

      {rowError && <p className="mt-2 text-[10px] leading-snug text-red-300/90">{rowError}</p>}

      {closing && (
        <CloseForm
          trade={trade}
          onDone={() => {
            setClosing(false);
            onChanged();
          }}
          onCancel={() => setClosing(false)}
        />
      )}
    </article>
  );
}

// ─── Info blurb ───────────────────────────────────────────────────────────────

function InfoDetails() {
  return (
    <details className="group mt-1">
      <summary className="flex cursor-pointer list-none items-center justify-center">
        <span className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-white/10 bg-black/30 font-mono text-[11px] text-white/50 hover:border-white/20 hover:text-white/70">
          i
        </span>
      </summary>
      <div className="mt-2 rounded-2xl border border-white/8 bg-white/[0.02] p-3 text-[11px] leading-relaxed text-white/46">
        <p>
          Realized PnL is summed over trades that have closed at least part of the position, in
          quote-currency units (gross minus all fees). Win rate is over fully closed trades only.
        </p>
        <p className="mt-1.5">
          Every trade is stamped at entry with what IntelliTrade&apos;s own meters read at that
          moment: the daily and intraday currency-strength ranks, the scanner&apos;s pair read, and
          the EURUSD zone grade when available.
        </p>
        <p className="mt-1.5 font-semibold text-white/70">
          The context stamp is a measurement taken at entry, not a trade recommendation.
        </p>
      </div>
    </details>
  );
}

// ─── Main panel ───────────────────────────────────────────────────────────────

interface JournalPanelProps {
  panel: Panel;
  onToggleLock: () => void;
  onRemove: () => void;
}

export function JournalPanel({ panel, onToggleLock, onRemove }: JournalPanelProps) {
  const [tick, setTick] = useState(0);
  const [data, setData] = useState<JournalResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [gated, setGated] = useState(false);
  const [showForm, setShowForm] = useState(false);

  const reload = useCallback(() => setTick((v) => v + 1), []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setGated(false);
    apiGet<JournalResponse>("/api/journal")
      .then((json) => {
        if (!cancelled) {
          setData(json);
          setLoading(false);
        }
      })
      .catch((e) => {
        if (cancelled) return;
        if (e instanceof ApiError && (e.status === 401 || e.status === 403)) setGated(true);
        else setError(e instanceof Error ? e.message : "Could not load journal");
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [tick]);

  const stats = data?.stats;
  const trades = data?.trades ?? [];
  const canEdit = data?.canEdit ?? false;

  return (
    <WidgetShell
      title="Trading journal"
      className="h-full"
      subtitle={stats ? `${stats.totalTrades} trade${stats.totalTrades === 1 ? "" : "s"}` : undefined}
      contentClassName="min-h-0 overflow-y-auto"
      headerRight={
        <>
          <IconAction label="Reload" onClick={reload}>
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          </IconAction>
          <PanelActions locked={panel.locked} onToggleLock={onToggleLock} onRemove={onRemove} />
        </>
      }
    >
      {loading && !data && (
        <div className="flex h-32 items-center justify-center text-sm text-white/30">Loading…</div>
      )}

      {gated && !data && (
        <div className="flex h-32 flex-col items-center justify-center gap-1 text-center">
          <div className="text-sm text-white/55">Pro subscription required</div>
          <div className="text-[11px] text-white/35">The trading journal is part of IntelliTrade Pro.</div>
        </div>
      )}

      {error && !data && (
        <div className="flex h-32 items-center justify-center text-sm text-red-400/70">{error}</div>
      )}

      {data && (
        <div className="space-y-4">
          {/* ── Stats strip ── */}
          {stats && (
            <section>
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
                <StatTile label="Total" value={String(stats.totalTrades)} />
                <StatTile label="Open" value={String(stats.openTrades + stats.partialTrades)} />
                <StatTile label="Closed" value={String(stats.closedTrades)} />
                <StatTile
                  label="Realized PnL"
                  value={fmtPnl(stats.totalRealizedPnl)}
                  tone={stats.totalRealizedPnl >= 0 ? "pos" : "neg"}
                />
                <StatTile
                  label="Win rate"
                  value={stats.winRate === null ? "—" : `${Math.round(stats.winRate * 100)}%`}
                />
              </div>
            </section>
          )}

          {/* ── Log-trade toggle + form ── */}
          {canEdit && (
            <section>
              {!showForm ? (
                <button
                  type="button"
                  onClick={() => setShowForm(true)}
                  className="inline-flex h-9 items-center gap-1.5 rounded-full border border-violet-400/25 bg-violet-500/12 px-4 text-[12px] font-semibold text-violet-100 transition-all hover:bg-violet-500/20"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Log trade
                </button>
              ) : (
                <LogTradeForm
                  onCreated={() => {
                    setShowForm(false);
                    reload();
                  }}
                  onCancel={() => setShowForm(false)}
                />
              )}
            </section>
          )}

          {/* ── Trades list / empty ── */}
          {trades.length === 0 ? (
            <div className="rounded-[1.35rem] border border-white/[0.07] bg-white/[0.02] px-4 py-6 text-center">
              <p className="text-[12px] leading-relaxed text-white/50">
                No trades yet. Log your first — IntelliTrade stamps every entry with what the meters
                read at that moment.
              </p>
              {canEdit && !showForm && (
                <button
                  type="button"
                  onClick={() => setShowForm(true)}
                  className="mt-3 inline-flex h-8 items-center gap-1.5 rounded-full border border-violet-400/25 bg-violet-500/12 px-4 text-[11px] font-semibold text-violet-100 transition-all hover:bg-violet-500/20"
                >
                  <Plus className="h-3 w-3" />
                  Log trade
                </button>
              )}
            </div>
          ) : (
            <section>
              <Kicker>Trades · newest first</Kicker>
              <div className="mt-2 space-y-2">
                {trades.map((t) => (
                  <TradeRow key={t.id} trade={t} canEdit={canEdit} onChanged={reload} />
                ))}
              </div>
            </section>
          )}

          {/* ── Info ── */}
          <div className="flex justify-center">
            <InfoDetails />
          </div>
        </div>
      )}
    </WidgetShell>
  );
}
