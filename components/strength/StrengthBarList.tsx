// Diverging strength bars shared by the free /currency-strength hub and the
// per-pair pages. Server component, no client JS.
//
// Diverging poles validated for the dark surface (same pair as the blog
// StrengthSnapshot): teal = stronger, orange = weaker. Polarity is never
// color-alone — bars extend left/right of the zero line and every row
// carries a signed value.
import type { TeaserReading } from "@/lib/strength-teaser";

const POSITIVE = "#0d9488";
const NEGATIVE = "#ea580c";

export type BarReading = TeaserReading & { rank?: number };

function Row({ reading, showDelta, showRank }: { reading: BarReading; showDelta: boolean; showRank: boolean }) {
  const { code, score, delta, rank } = reading;
  const halfWidth = Math.abs(score) / 2; // % of the full track
  const positive = score >= 0;
  return (
    <div className="flex items-center gap-3 text-sm">
      <span className="w-10 shrink-0 font-mono text-slate-300">{code}</span>
      {showRank && (
        <span className="w-12 shrink-0 font-mono text-[11px] text-white/40">
          {rank ? `#${rank} of 8` : ""}
        </span>
      )}
      <div className="relative h-3 flex-1 overflow-hidden rounded-full bg-white/[0.06]">
        <span className="absolute inset-y-0 left-1/2 w-px bg-white/20" aria-hidden />
        <span
          className="absolute inset-y-[2px] rounded-[4px]"
          style={{
            backgroundColor: positive ? POSITIVE : NEGATIVE,
            left: positive ? "50%" : `${50 - halfWidth}%`,
            width: `${halfWidth}%`,
          }}
          aria-hidden
        />
      </div>
      <span className="w-14 shrink-0 text-right font-mono text-xs text-slate-200">
        {score > 0 ? "+" : ""}
        {score.toFixed(1)}
      </span>
      {showDelta && (
        <span className="w-14 shrink-0 text-right font-mono text-[11px] text-white/40">
          {delta === null ? "·" : `${delta > 0 ? "+" : ""}${delta.toFixed(1)}`}
        </span>
      )}
    </div>
  );
}

export function StrengthBarList({
  readings,
  showDelta,
  showRank = false,
}: {
  readings: BarReading[];
  showDelta: boolean;
  showRank?: boolean;
}) {
  return (
    <>
      <div className="mb-2 flex items-center gap-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-white/32">
        <span className="w-10 shrink-0">Ccy</span>
        {showRank && <span className="w-12 shrink-0">Rank</span>}
        <span className="flex-1" />
        <span className="w-14 shrink-0 text-right">Score</span>
        {showDelta && <span className="w-14 shrink-0 text-right">1d change</span>}
      </div>
      <div className="space-y-2">
        {readings.map((reading) => (
          <Row key={reading.code} reading={reading} showDelta={showDelta} showRank={showRank} />
        ))}
      </div>
    </>
  );
}
