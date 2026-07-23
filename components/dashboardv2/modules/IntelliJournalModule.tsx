"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowRight, BookOpen, Download, Plus, TrendingUp } from "lucide-react";

import type {
  JournalDashboardStats,
  JournalListResponse,
} from "@/lib/journal/types";

type JournalState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | {
      status: "ready";
      stats: JournalDashboardStats;
      list: JournalListResponse;
    };

function formatNumber(value: number | null, suffix = "") {
  if (value == null) return "--";
  return `${value >= 0 ? "+" : ""}${value.toFixed(2)}${suffix}`;
}

export function IntelliJournalSurface({ compact = false }: { compact?: boolean }) {
  const [state, setState] = useState<JournalState>({ status: "loading" });

  useEffect(() => {
    const controller = new AbortController();
    Promise.all([
      fetch("/api/journal/stats", { cache: "no-store", signal: controller.signal }),
      fetch("/api/journal?page=1&limit=5", {
        cache: "no-store",
        signal: controller.signal,
      }),
    ])
      .then(async ([statsResponse, listResponse]) => {
        if (!statsResponse.ok || !listResponse.ok) {
          throw new Error(
            statsResponse.status === 403 || listResponse.status === 403
              ? "An active or trialing subscription is required."
              : "Journal data could not be loaded.",
          );
        }
        return Promise.all([
          statsResponse.json() as Promise<JournalDashboardStats>,
          listResponse.json() as Promise<JournalListResponse>,
        ]);
      })
      .then(([stats, list]) => setState({ status: "ready", stats, list }))
      .catch((error: unknown) => {
        if (!controller.signal.aborted) {
          setState({
            status: "error",
            message: error instanceof Error ? error.message : "Journal data could not be loaded.",
          });
        }
      });
    return () => controller.abort();
  }, []);

  if (state.status === "loading") {
    return <div className="grid min-h-48 place-items-center text-sm text-white/55">Loading private journal...</div>;
  }

  if (state.status === "error") {
    return (
      <div className="grid min-h-48 place-items-center rounded-2xl border border-red-400/15 bg-red-500/5 p-6 text-center text-sm text-red-100">
        {state.message}
      </div>
    );
  }

  const { stats, list } = state;
  return (
    <div className="flex h-full min-h-0 flex-col gap-4 overflow-auto">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-xs font-bold uppercase tracking-[0.22em] text-violet-200/60">
            Realized journal
          </div>
          <div className="mt-1 text-sm text-white/55">
            {stats.total_trades
              ? `${stats.closed_trades} closed, ${stats.open_trades} open`
              : "No trades recorded yet"}
          </div>
        </div>
        <Link
          href="/dashboardv2/journal"
          className="inline-flex min-h-10 items-center gap-2 rounded-full border border-violet-300/20 bg-violet-400/10 px-4 text-sm font-semibold text-violet-100"
        >
          Open workspace <ArrowRight className="h-4 w-4" />
        </Link>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        {[
          ["Net closed", formatNumber(stats.net_pnl_closed)],
          ["Average R", formatNumber(stats.avg_r_closed_or_resolved, "R")],
          ["Trades", String(stats.total_trades)],
        ].map(([label, value]) => (
          <div key={label} className="rounded-2xl border border-white/10 bg-white/[0.035] p-4">
            <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/45">{label}</div>
            <div className="mt-2 text-xl font-semibold text-white">{value}</div>
          </div>
        ))}
      </div>

      <div className="grid gap-2">
        {list.data.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-white/12 p-5 text-sm text-white/50">
            Add an account and instrument, then record your first execution.
          </div>
        ) : (
          list.data.map((trade) => (
            <Link
              key={trade.id}
              href={`/dashboardv2/journal/trades/${trade.id}`}
              className="grid grid-cols-[1fr_auto] gap-3 rounded-2xl border border-white/8 bg-white/[0.025] px-4 py-3"
            >
              <span>
                <span className="block font-semibold text-white">{trade.symbol ?? "Unavailable"}</span>
                <span className="text-xs text-white/45">{trade.side} · {trade.strategy ?? "No strategy"}</span>
              </span>
              <span className={trade.pnl_net >= 0 ? "text-emerald-300" : "text-red-300"}>
                {formatNumber(trade.pnl_net)}
              </span>
            </Link>
          ))
        )}
      </div>

      {!compact ? (
        <div className="grid gap-2 sm:grid-cols-3">
          <Link className="journal-button-primary" href="/dashboardv2/journal/trades/new"><Plus className="h-4 w-4" /> Add trade</Link>
          <Link className="journal-button" href="/dashboardv2/journal/reviews"><BookOpen className="h-4 w-4" /> Reviews</Link>
          <Link className="journal-button" href="/dashboardv2/journal/exports"><Download className="h-4 w-4" /> Exports</Link>
        </div>
      ) : null}
      <span className="sr-only"><TrendingUp />Realized equity is available in the full workspace.</span>
    </div>
  );
}
