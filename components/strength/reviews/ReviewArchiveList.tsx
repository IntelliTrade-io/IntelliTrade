"use client";

// Completed-review archive list with client-side-only filters (no URL params,
// no SEO surface, no unpublished counts). Renders the server-provided list.
import { useMemo, useState } from "react";
import Link from "next/link";
// Type-only import (erased at build): a client component must never pull the
// server-only csmReviews module (it holds the service-role client). The base
// path is inlined for the same reason.
import type { ArchiveItemDto } from "@/lib/api/csmReviews";

const CSM_REVIEWS_BASE_PATH = "/currency-strength/reviews";

function fmtDay(iso: string): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(iso));
}

function fmtPct(v: number): string {
  return `${v > 0 ? "+" : ""}${v.toFixed(2)}%`;
}

const ALL = "all";

export function ReviewArchiveList({ items }: { items: ArchiveItemDto[] }) {
  const [year, setYear] = useState(ALL);
  const [classification, setClassification] = useState(ALL);
  const [pair, setPair] = useState(ALL);

  const years = useMemo(
    () => Array.from(new Set(items.map((i) => i.capturedAt.slice(0, 4)))).sort().reverse(),
    [items],
  );
  const pairs = useMemo(
    () => Array.from(new Set(items.map((i) => i.pairSymbol))).sort(),
    [items],
  );

  const filtered = items.filter(
    (i) =>
      (year === ALL || i.capturedAt.slice(0, 4) === year) &&
      (classification === ALL || i.classification === classification) &&
      (pair === ALL || i.pairSymbol === pair),
  );

  const selectCls =
    "rounded-lg border border-white/15 bg-white/[0.04] px-3 py-1.5 text-sm text-white/80";

  return (
    <div>
      <div className="mb-6 flex flex-wrap gap-3">
        <select className={selectCls} value={year} onChange={(e) => setYear(e.target.value)}>
          <option value={ALL}>All years</option>
          {years.map((y) => (
            <option key={y} value={y}>{y}</option>
          ))}
        </select>
        <select
          className={selectCls}
          value={classification}
          onChange={(e) => setClassification(e.target.value)}
        >
          <option value={ALL}>All outcomes</option>
          <option value="continued">Continued</option>
          <option value="mixed">Mixed</option>
          <option value="reversed">Reversed</option>
        </select>
        <select className={selectCls} value={pair} onChange={(e) => setPair(e.target.value)}>
          <option value={ALL}>All pairs</option>
          {pairs.map((p) => (
            <option key={p} value={p}>{p}</option>
          ))}
        </select>
      </div>

      <ul className="space-y-3">
        {filtered.map((item) => (
          <li key={item.slug}>
            <Link
              href={`${CSM_REVIEWS_BASE_PATH}/${item.slug}`}
              className="flex flex-col gap-2 rounded-2xl border border-white/12 bg-white/[0.03] p-4 transition hover:border-white/20 hover:bg-white/[0.06] sm:flex-row sm:items-center sm:justify-between"
            >
              <div>
                <p className="text-[15px] font-medium text-white">
                  {item.strongCurrency} strongest, {item.weakCurrency} weakest
                </p>
                <p className="mt-0.5 text-[12px] text-white/45">
                  {item.pairSymbol} · captured {fmtDay(item.capturedAt)} · {item.regimeLabel} ·{" "}
                  {item.modelGeneration}
                </p>
              </div>
              <div className="flex items-center gap-4 font-mono text-sm">
                <span className="text-white/60">30b {fmtPct(item.shortReturnPct)}</span>
                <span className="text-white/80">60b {fmtPct(item.longReturnPct)}</span>
                <span className="rounded-full border border-white/15 px-2 py-0.5 text-[11px] capitalize text-white/70">
                  {item.classification}
                </span>
              </div>
            </Link>
          </li>
        ))}
      </ul>

      {filtered.length === 0 && (
        <p className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-8 text-center text-sm text-white/45">
          No reviews match these filters yet.
        </p>
      )}
    </div>
  );
}
