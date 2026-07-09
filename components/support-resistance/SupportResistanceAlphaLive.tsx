"use client";

import { useEffect, useState } from "react";
import { apiGet, ApiError } from "@/lib/api/client";
import { SupportResistanceAlphaModule } from "./SupportResistanceAlphaModule";
import type { CandleData, SupportResistanceZone } from "./types";

interface ApiResponse {
  zones?: SupportResistanceZone[];
  candles?: CandleData[];
  calculatedAt?: string | null;
  error?: string;
}

interface SupportResistanceAlphaLiveProps {
  compact?: boolean;
  /** Refetch interval in ms. Worker writes every 15 min; 60s keeps it fresh. */
  refreshMs?: number;
}

export function SupportResistanceAlphaLive({ compact = false, refreshMs = 60_000 }: SupportResistanceAlphaLiveProps) {
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const json = await apiGet<ApiResponse>("/api/sr-alpha");
        if (cancelled) return;
        if (json.error) {
          setError(json.error);
        } else {
          setData(json);
          setError(null);
        }
      } catch (err) {
        if (cancelled) return;
        if (err instanceof ApiError) {
          setError(err.message);
        } else {
          setError(err instanceof Error ? err.message : "Failed to load");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    const id = setInterval(load, refreshMs);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [refreshMs]);

  if (loading && !data) {
    return (
      <div className="flex h-full min-h-[240px] items-center justify-center rounded-[22px] border border-white/10 bg-white/[0.02] text-sm text-white/50">
        Loading live EURUSD support zones…
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="flex h-full min-h-[240px] items-center justify-center rounded-[22px] border border-rose-400/20 bg-rose-500/[0.06] px-6 text-center text-sm text-rose-100/80">
        Could not load support zones: {error}
      </div>
    );
  }

  const zones = data?.zones ?? [];

  if (!zones.length) {
    return (
      <div className="flex h-full min-h-[240px] items-center justify-center rounded-[22px] border border-white/10 bg-white/[0.02] px-6 text-center text-sm text-white/50">
        No active EURUSD support zones right now. The scoring worker refreshes every 15 minutes.
      </div>
    );
  }

  // Snapshot freshness. The intraday worker writes every 15 min; flag stale > 30m.
  const calcAt = data?.calculatedAt ? new Date(data.calculatedAt) : null;
  const ageMinutes = calcAt ? (Date.now() - calcAt.getTime()) / 60000 : null;
  const isStale = ageMinutes != null && ageMinutes > 30;
  const snapshotLabel = calcAt
    ? new Intl.DateTimeFormat("en-US", {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
        timeZone: "UTC",
      }).format(calcAt)
    : null;

  // Always pass the REAL candles (never mock — mock ~1.08 prices would sit far
  // from real EURUSD ~1.1x zones and render the bands off-screen).
  return (
    <div className={compact ? "flex h-full min-h-0 flex-col gap-2" : "grid gap-2"}>
      {isStale ? (
        <div className="rounded-full border border-amber-300/30 bg-amber-400/[0.08] px-3 py-1.5 text-xs text-amber-100">
          Data may be stale — last snapshot {snapshotLabel} UTC. The scoring worker refreshes every 15 minutes.
        </div>
      ) : snapshotLabel ? (
        <div className="text-xs text-white/44">Latest EURUSD M15 snapshot · {snapshotLabel} UTC</div>
      ) : null}
      <div className={compact ? "min-h-0 flex-1 overflow-hidden" : ""}>
        <SupportResistanceAlphaModule zones={zones} candles={data?.candles ?? []} compact={compact} />
      </div>
    </div>
  );
}

export default SupportResistanceAlphaLive;
