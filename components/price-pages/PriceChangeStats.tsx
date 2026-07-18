// Compact 24h / 7d / 30d change strip for the prices-today heroes. Figures are
// computed server-side (lib/api/priceHistory.ts) and passed down as props so
// they render as crawlable text; this component only formats. Type-only import
// keeps the server-only fetcher out of the client bundle.

import type { PriceChangeFigures } from "@/lib/api/priceHistory";

function ChangeChip({ label, value }: { label: string; value: number | null }) {
  const tone =
    value === null || Math.abs(value) < 0.005
      ? "text-slate-300"
      : value > 0
        ? "text-emerald-400"
        : "text-red-400";
  const text = value === null ? "—" : `${value > 0 ? "+" : ""}${value.toFixed(2)}%`;
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] px-3.5 py-2">
      <span className="text-[11px] uppercase tracking-[0.14em] text-slate-400">{label}</span>
      <span className={`ml-2 text-sm font-semibold tabular-nums ${tone}`}>{text}</span>
    </div>
  );
}

export function PriceChangeStats({
  figures,
  assetLabel,
}: {
  figures: PriceChangeFigures | null;
  /** Lowercase asset name for the accessible label, e.g. "gold". */
  assetLabel: string;
}) {
  if (!figures) return null;
  return (
    <div aria-label={`Recent ${assetLabel} price performance`} className="mt-6">
      {/* No "now" price chip on purpose: the realtime TradingView widget next to
          the hero is the live quote; a cached CF number beside it just clashes. */}
      <div className="flex flex-wrap items-center gap-2.5">
        <ChangeChip label="24h" value={figures.d1} />
        <ChangeChip label="7 days" value={figures.d7} />
        <ChangeChip label="30 days" value={figures.d30} />
      </div>
      <p className="mt-2 text-[11px] text-slate-500">
        Change vs the same time 1, 7 and 30 days ago (indicative market reference).
      </p>
    </div>
  );
}
