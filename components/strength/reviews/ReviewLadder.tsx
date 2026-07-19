// Original 8-currency ladder as captured, reconstructed only from the immutable
// review snapshot. Rank 1 and rank 8 are emphasized; no interpretation text.
import type { LadderRowDto } from "@/lib/api/csmReviews";

function barWidth(score: number): string {
  const pct = Math.min(100, Math.abs(score));
  return `${pct}%`;
}

export function ReviewLadder({ ladder }: { ladder: LadderRowDto[] }) {
  return (
    <dl className="space-y-1.5">
      {ladder.map((row) => {
        const positive = row.score >= 0;
        const emphasized = row.rank === 1 || row.rank === 8;
        return (
          <div
            key={row.currency}
            className={`flex items-center gap-3 rounded-lg px-2 py-1.5 ${
              emphasized ? "bg-white/[0.06]" : ""
            }`}
          >
            <span
              className={`inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-[11px] font-semibold ${
                emphasized ? "bg-brand/20 text-brand-100" : "bg-white/5 text-white/50"
              }`}
            >
              {row.rank}
            </span>
            <dt
              className={`w-10 shrink-0 font-mono text-sm ${
                emphasized ? "text-white" : "text-white/70"
              }`}
            >
              {row.currency}
            </dt>
            <div className="relative h-2 flex-1 overflow-hidden rounded-full bg-white/[0.04]">
              <div className="absolute inset-y-0 left-1/2 w-px bg-white/15" aria-hidden />
              <div
                className={`absolute inset-y-0 ${positive ? "left-1/2" : "right-1/2"} rounded-full ${
                  positive ? "bg-teal-400/70" : "bg-orange-400/70"
                }`}
                style={{ width: `calc(${barWidth(row.score)} / 2)` }}
                aria-hidden
              />
            </div>
            <dd className="w-14 shrink-0 text-right font-mono text-sm tabular-nums text-white/80">
              {row.score > 0 ? "+" : ""}
              {row.score.toFixed(1)}
            </dd>
          </div>
        );
      })}
    </dl>
  );
}
