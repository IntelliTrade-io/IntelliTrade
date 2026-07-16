"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { RefreshCw } from "lucide-react";
import { apiGet } from "@/lib/api/client";
import type { Scores, Expression } from "@/lib/strength";
import { computeExpressions } from "@/lib/strength";
import type { EntryAssistResponse } from "@/types/domain/entry-assist";
import { WidgetShell } from "../../ui/widget-shell";
import { IconAction, PanelActions } from "../../ui/panel-actions";
import type { Panel } from "../../types";

import {
  type CCY,
  type FilterState,
  initialState,
  deserialize,
  serialize,
  toggleCurrency,
  showAll,
  focusPair,
  clearPairFocus,
  effectiveVisible,
} from "@/lib/intradayFilters";
import { MarketPulse } from "./MarketPulse";
import { CurrencyChips } from "./CurrencyChips";
import { IntradayChart, type HistoryPoint } from "./IntradayChart";
import { EntryAssistSection } from "./EntryAssistSection";
import { PairExpressions } from "./PairExpressions";

const VISIBLE_STORAGE_KEY = "dashboardv2-intraday-visible-currencies";
const STALE_AGE_SECONDS = 20 * 60;

interface IntradayStrengthPanelProps {
  panel: Panel;
  onToggleLock: () => void;
  onRemove: () => void;
  workspaceCols?: number; // passed by the Dashboard call site; unused here
}

// ─── Independent data hooks (one failing never blanks the others) ────────────

interface ScoresResult {
  currencies: Scores;
  fetchedAt: string;
  cacheAgeSeconds: number;
}

function useScores(tick: number) {
  const [data, setData] = useState<ScoresResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(false);
    apiGet<ScoresResult>("/api/currency-strength?type=intraday")
      .then((json) => { if (!cancelled) { setData(json); setLoading(false); } })
      .catch(() => { if (!cancelled) { setError(true); setLoading(false); } });
    return () => { cancelled = true; };
  }, [tick]);

  return { data, loading, error };
}

function useHistory(tick: number) {
  const [points, setPoints] = useState<HistoryPoint[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    apiGet<{ points?: HistoryPoint[] }>("/api/currency-strength-history?type=intraday&hours=24")
      .then((json) => { if (!cancelled) { setPoints(json.points ?? []); setLoading(false); } })
      .catch(() => { if (!cancelled) { setLoading(false); } });
    return () => { cancelled = true; };
  }, [tick]);

  return { points, loading };
}

function useEntryAssist(tick: number) {
  const [data, setData] = useState<EntryAssistResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(false);
    apiGet<EntryAssistResponse>("/api/entry-assist")
      .then((json) => { if (!cancelled) { setData(json); setLoading(false); } })
      .catch(() => { if (!cancelled) { setError(true); setLoading(false); } });
    return () => { cancelled = true; };
  }, [tick]);

  return { data, loading, error };
}

// ─── Panel ──────────────────────────────────────────────────────────────────

export function IntradayStrengthPanel({ panel, onToggleLock, onRemove }: IntradayStrengthPanelProps) {
  const [tick, setTick] = useState(0);
  const [filters, setFilters] = useState<FilterState>(initialState);
  const [emphasized, setEmphasized] = useState<CCY | null>(null);

  // Read persisted selection once on mount (SSR-safe). Pair focus is never persisted.
  useEffect(() => {
    if (typeof window === "undefined") return;
    setFilters(deserialize(window.localStorage.getItem(VISIBLE_STORAGE_KEY)));
  }, []);

  // Persist the stored selection whenever it changes.
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(VISIBLE_STORAGE_KEY, serialize(filters));
    } catch {
      // storage unavailable (private mode, quota): selection stays in memory
    }
  }, [filters]);

  const { data: scoresData, loading: scoresLoading, error: scoresError } = useScores(tick);
  const { points } = useHistory(tick);
  const { data: entryAssist, loading: eaLoading, error: eaError } = useEntryAssist(tick);

  const scores = useMemo<Scores>(() => scoresData?.currencies ?? ({} as Scores), [scoresData]);
  const expressions: Expression[] = useMemo(
    () => (scoresData ? computeExpressions(scores) : []),
    [scoresData, scores],
  );
  const visible = effectiveVisible(filters);

  const isStale = entryAssist?.dataStatus === "stale" || (scoresData?.cacheAgeSeconds ?? 0) > STALE_AGE_SECONDS;
  const ago = scoresData
    ? scoresData.cacheAgeSeconds < 60
      ? `${scoresData.cacheAgeSeconds}s ago`
      : `${Math.round(scoresData.cacheAgeSeconds / 60)}m ago`
    : null;
  const subtitle = ago ? (isStale ? `${ago} · Data delayed` : ago) : undefined;

  const onFocusPair = useCallback((base: CCY, quote: CCY) => {
    setFilters((s) => focusPair(s, base, quote));
  }, []);

  return (
    <WidgetShell
      title="Currency strength · intraday"
      className="h-full"
      subtitle={subtitle}
      contentClassName="min-h-0 overflow-y-auto"
      headerRight={
        <>
          <IconAction label="Reload" onClick={() => setTick((v) => v + 1)}>
            <RefreshCw className={`h-3.5 w-3.5 ${scoresLoading ? "animate-spin" : ""}`} />
          </IconAction>
          <PanelActions locked={panel.locked} onToggleLock={onToggleLock} onRemove={onRemove} />
        </>
      }
    >
      {scoresLoading && !scoresData && (
        <div className="flex h-32 items-center justify-center text-sm text-white/30">Loading...</div>
      )}
      {scoresError && !scoresData && (
        <div className="flex h-32 items-center justify-center text-sm text-white/40">
          Strength data is unavailable right now.
        </div>
      )}

      {scoresData && (
        <div className="space-y-4">
          <MarketPulse scores={scores} expressions={expressions} />

          <CurrencyChips
            visible={filters.visible}
            pairFocus={filters.pairFocus}
            onToggle={(c) => setFilters((s) => toggleCurrency(s, c))}
            onShowAll={() => setFilters((s) => showAll(s))}
            onClearFocus={() => setFilters((s) => clearPairFocus(s))}
            onEmphasize={setEmphasized}
          />

          <IntradayChart points={points} visible={visible} emphasized={emphasized} />

          <EntryAssistSection
            candidates={entryAssist?.candidates ?? []}
            dataStatus={entryAssist?.dataStatus ?? null}
            error={eaError}
            loading={eaLoading}
            onFocusPair={onFocusPair}
          />

          <PairExpressions scores={scores} candidates={entryAssist?.candidates ?? []} onFocusPair={onFocusPair} />

          <details className="group">
            <summary className="flex cursor-pointer list-none items-center justify-center">
              <span className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-white/10 bg-black/30 font-mono text-[11px] text-white/50 hover:border-white/20 hover:text-white/70">
                i
              </span>
            </summary>
            <div className="mt-2 rounded-2xl border border-white/8 bg-white/[0.02] p-3 text-[11px] leading-relaxed text-white/46">
              <p>
                Strength is derived from cross-pair aggregation on a fixed -100 to 100 scale. Entry Assist
                highlights a small set of researched pair and session combinations when their momentum
                conditions are met. It is educational context, not a trade instruction.
              </p>
            </div>
          </details>
        </div>
      )}
    </WidgetShell>
  );
}

export function CurrencyStrengthIntradayPanelNative(props: IntradayStrengthPanelProps) {
  return <IntradayStrengthPanel {...props} />;
}
