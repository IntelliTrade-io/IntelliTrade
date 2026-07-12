import { supabaseAdmin } from "@/lib/supabase/admin";
import { CURRENCIES } from "@/lib/strength";
import { TrackedLink } from "@/components/layout/TrackedLink";

// Diverging poles validated for the dark surface (dataviz six-checks pass):
// teal = stronger, orange = weaker. Polarity is never color-alone — bars
// extend left/right of the zero line and every row carries a signed value.
const POSITIVE = "#0d9488";
const NEGATIVE = "#ea580c";

type Reading = { code: string; score: number };

/**
 * Proprietary-data block for blog posts (AdSense plan §1): the daily
 * currency-strength reading closest to the post's publication moment,
 * rendered as a small diverging bar meter. Renders nothing when no
 * snapshot exists within the window (history starts 2026-06-14), so old
 * posts are untouched and the block never shows data from the wrong week.
 */
export async function StrengthSnapshot({ publishedAt }: { publishedAt?: string }) {
  if (!publishedAt) return null;
  const published = new Date(publishedAt);
  if (isNaN(published.getTime())) return null;

  const windowStart = new Date(published.getTime() - 72 * 3600 * 1000).toISOString();
  const windowEnd = new Date(published.getTime() + 12 * 3600 * 1000).toISOString();

  let readings: Reading[] = [];
  let snapshotAt: Date | null = null;

  try {
    const { data, error } = await supabaseAdmin
      .from("currency_strength_snapshots")
      .select("currencies_weighted, created_at")
      .eq("type", "daily")
      .gte("created_at", windowStart)
      .lte("created_at", windowEnd)
      .order("created_at", { ascending: false })
      .limit(1);

    if (error || !data?.[0]) return null;

    const cw = (data[0].currencies_weighted ?? {}) as Record<string, { score?: number }>;
    readings = CURRENCIES.filter((c) => typeof cw[c]?.score === "number").map((c) => ({
      code: c,
      score: Math.max(-100, Math.min(100, Math.round((cw[c]!.score as number) * 10) / 10)),
    }));
    snapshotAt = new Date(data[0].created_at);
  } catch {
    return null;
  }

  if (readings.length < CURRENCIES.length) return null;

  readings.sort((a, b) => b.score - a.score);
  const dateLabel = snapshotAt!.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  return (
    <aside
      aria-label="IntelliTrade currency strength snapshot at publication"
      className="mt-14 rounded-2xl border border-white/10 bg-white/[0.03] p-6 text-left md:p-8"
    >
      <div className="mb-1 text-[11px] font-medium tracking-[0.22em] text-brand/90">
        INTELLITRADE DATA
      </div>
      <h2 className="text-lg font-semibold tracking-tight text-white">
        Currency strength at publication
      </h2>
      <p className="mb-6 mt-1 text-xs text-slate-400">
        Daily weighted reading from the IntelliTrade strength meter, {dateLabel}. Scale −100 (weakest) to +100 (strongest).
      </p>

      <div className="space-y-2">
        {readings.map(({ code, score }) => {
          const halfWidth = Math.abs(score) / 2; // % of the full track
          const positive = score >= 0;
          return (
            <div key={code} className="flex items-center gap-3 text-sm">
              <span className="w-10 shrink-0 font-mono text-slate-300">{code}</span>
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
              <span className="w-14 shrink-0 text-right font-mono text-xs text-slate-300">
                {score > 0 ? "+" : ""}
                {score.toFixed(1)}
              </span>
            </div>
          );
        })}
      </div>

      <p className="mt-6 text-xs leading-relaxed text-slate-500">
        Snapshot for educational context — how the meter read the market when this analysis was
        written, not a recommendation. The live meter, intraday readings and history are part of{" "}
        <TrackedLink
          href="/pro"
          event="blog_snapshot_pro_click"
          className="text-brand underline-offset-2 hover:underline"
        >
          IntelliTrade Pro
        </TrackedLink>
        .
      </p>
    </aside>
  );
}
