// Metric + classification cards for a completed review. Raw numbers are always
// shown; the classification label never hides a negative result.
import type { ReviewDto } from "@/lib/api/csmReviews";

function fmtPct(v: number): string {
  return `${v > 0 ? "+" : ""}${v.toFixed(2)}%`;
}

const CLASS_STYLES = {
  continued: { label: "Continued", cls: "border-emerald-400/30 bg-emerald-500/10 text-emerald-200" },
  mixed: { label: "Mixed", cls: "border-amber-400/30 bg-amber-500/10 text-amber-200" },
  reversed: { label: "Reversed", cls: "border-rose-400/30 bg-rose-500/10 text-rose-200" },
} as const;

const CLASS_SENTENCE = {
  continued: "The pair extended in the direction of the original reading.",
  mixed: "The pair finished close to where it started relative to the reading.",
  reversed: "The pair moved against the direction of the original reading.",
} as const;

type ClassKey = keyof typeof CLASS_STYLES;

function classKey(value: string): ClassKey {
  return value === "continued" || value === "reversed" ? value : "mixed";
}

function MetricCard({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: string;
  tone?: "neutral" | "adverse";
}) {
  return (
    <div
      className={`rounded-2xl border p-4 ${
        tone === "adverse"
          ? "border-rose-400/20 bg-rose-500/[0.06]"
          : "border-white/12 bg-white/[0.04]"
      }`}
    >
      <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-white/40">{label}</p>
      <p className="mt-2 font-mono text-xl tabular-nums text-white">{value}</p>
    </div>
  );
}

export function ReviewMetrics({ review }: { review: ReviewDto }) {
  const key = classKey(review.classification);
  const klass = CLASS_STYLES[key];
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
      <MetricCard label="30-bar result" value={fmtPct(review.shortReturnPct)} />
      <MetricCard label="60-bar result" value={fmtPct(review.longReturnPct)} />
      <MetricCard label="Max continuation" value={fmtPct(review.maxContinuationPct)} />
      <MetricCard label="Largest pullback" value={fmtPct(review.maxPullbackPct)} tone="adverse" />
      <div className={`col-span-2 rounded-2xl border p-4 lg:col-span-1 ${klass.cls}`}>
        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] opacity-70">
          Classification
        </p>
        <p className="mt-2 text-lg font-semibold">{klass.label}</p>
        <p className="mt-1 text-[12px] leading-snug opacity-80">
          {CLASS_SENTENCE[key]}
        </p>
      </div>
    </div>
  );
}
