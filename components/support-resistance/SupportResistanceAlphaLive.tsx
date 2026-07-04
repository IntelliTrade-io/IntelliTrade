"use client";

import { useEffect, useState } from "react";
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
        const res = await fetch("/api/sr-alpha", { cache: "no-store" });
        const json: ApiResponse = await res.json();
        if (cancelled) return;
        if (!res.ok || json.error) {
          setError(json.error ?? `Request failed (${res.status})`);
        } else {
          setData(json);
          setError(null);
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load");
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

  // Always pass the REAL candles (never fall back to mock ~1.08 prices, which
  // would sit far from real EURUSD ~1.1x zones and render the bands off-screen).
  return (
    <SupportResistanceAlphaModule
      zones={zones}
      candles={data?.candles ?? []}
      compact={compact}
    />
  );
}

export default SupportResistanceAlphaLive;
