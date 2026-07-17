"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { fetchUsdPrice } from "@/lib/api/market";

// Matches the /api/rates upstream cache (60s) — polling faster than that only
// re-reads the same cached value, polling slower just makes the chip staler.
const REFRESH_MS = 60_000;

type Quote = { price: number; pctChange: number };

/**
 * Compact live EUR/USD chip for the navbar. Percentage is measured against the
 * first price seen this session (same session-open convention the price pages
 * use). Renders nothing until the first quote arrives, and hides itself for
 * good if the rates API is unavailable.
 */
export default function EurUsdTicker() {
  const [quote, setQuote] = useState<Quote | null>(null);
  const openRef = useRef<number | null>(null);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      const price = await fetchUsdPrice("EUR");
      if (price === null || cancelled) return;
      if (openRef.current === null) openRef.current = price;
      const pctChange = ((price - openRef.current) / openRef.current) * 100;
      setQuote({ price, pctChange });
    };

    load();
    const id = window.setInterval(load, REFRESH_MS);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, []);

  if (!quote) return null;

  const isDown = quote.pctChange < 0;
  const Arrow = isDown ? ChevronDown : ChevronUp;

  return (
    <div className="hidden items-center gap-2.5 rounded-[11px] border border-white/[0.07] bg-white/[0.03] px-3 py-1.5 lg:flex">
      <span className="text-xs font-semibold tracking-wide text-zinc-400">
        EURUSD
      </span>
      <span className="text-sm font-semibold tabular-nums text-zinc-100">
        {quote.price.toFixed(4)}
      </span>
      <span
        className={`flex items-center gap-0.5 text-xs font-semibold tabular-nums ${
          isDown ? "text-red-400" : "text-emerald-400"
        }`}
      >
        <Arrow aria-hidden className="h-3 w-3" />
        {Math.abs(quote.pctChange).toFixed(2)}%
      </span>
    </div>
  );
}
