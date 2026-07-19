import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { requireSubscription } from "@/lib/auth/requireSubscription";

export const dynamic = "force-dynamic";

const CURRENCIES = ["USD", "EUR", "GBP", "JPY", "AUD", "NZD", "CAD", "CHF"] as const;

// Per-type window caps chosen so row volume stays under PostgREST's 1000-row
// response cap (ascending order + limit would otherwise drop the NEWEST rows):
// daily snapshots arrive every 4h (~540 rows / 90d); intraday every 15 min,
// so a week (~672 rows) is the intraday ceiling.
const MAX_HOURS = { daily: 90 * 24, intraday: 168 } as const;

export type HistoryPoint = {
  ts: string;
} & Record<(typeof CURRENCIES)[number], number>;

export async function GET(request: Request) {
  const denied = await requireSubscription();
  if (denied) return denied;

  const { searchParams } = new URL(request.url);
  const type = searchParams.get("type") === "daily" ? "daily" : "intraday";
  const hoursStr = searchParams.get("hours");
  const hours = Math.min(Math.max(parseInt(hoursStr ?? "24", 10) || 24, 1), MAX_HOURS[type]);

  // Time-window filter instead of row-count math: cadence differs per type
  // (and per feed) and a wrong row estimate silently truncated the window.
  const cutoff = new Date(Date.now() - hours * 3600 * 1000).toISOString();

  const { data, error } = await supabaseAdmin
    .from("currency_strength_snapshots")
    .select("currencies_weighted, created_at")
    .eq("type", type)
    .gte("created_at", cutoff)
    .order("created_at", { ascending: true })
    .limit(1000);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!data || data.length === 0) {
    return NextResponse.json({ points: [] });
  }

  // Already oldest → newest (left → right on chart)
  const points: HistoryPoint[] = data.map((row) => {
    const cw = row.currencies_weighted ?? {};
    const point: Partial<HistoryPoint> = { ts: row.created_at };
    for (const c of CURRENCIES) {
      point[c] = typeof cw[c]?.score === "number" ? Math.round(cw[c].score * 10) / 10 : 0;
    }
    return point as HistoryPoint;
  });

  return NextResponse.json({ points, type, hours });
}
