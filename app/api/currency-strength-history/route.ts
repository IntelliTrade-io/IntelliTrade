import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { requireSubscription } from "@/lib/auth/requireSubscription";

export const dynamic = "force-dynamic";

const CURRENCIES = ["USD", "EUR", "GBP", "JPY", "AUD", "NZD", "CAD", "CHF"] as const;

export type HistoryPoint = {
  ts: string;
} & Record<(typeof CURRENCIES)[number], number>;

export async function GET(request: Request) {
  const denied = await requireSubscription();
  if (denied) return denied;

  const { searchParams } = new URL(request.url);
  const type = searchParams.get("type") === "daily" ? "daily" : "intraday";
  const hoursStr = searchParams.get("hours");
  const hours = Math.min(Math.max(parseInt(hoursStr ?? "24", 10) || 24, 1), 168);
  const limit = type === "intraday" ? hours * 4 : hours; // 15-min vs 1h cadence

  const { data, error } = await supabaseAdmin
    .from("currency_strength_snapshots")
    .select("currencies_weighted, created_at")
    .eq("type", type)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!data || data.length === 0) {
    return NextResponse.json({ points: [] });
  }

  // Reverse so oldest → newest (left → right on chart)
  const points: HistoryPoint[] = data.reverse().map((row) => {
    const cw = row.currencies_weighted ?? {};
    const point: Partial<HistoryPoint> = { ts: row.created_at };
    for (const c of CURRENCIES) {
      point[c] = typeof cw[c]?.score === "number" ? Math.round(cw[c].score * 10) / 10 : 0;
    }
    return point as HistoryPoint;
  });

  return NextResponse.json({ points, type, hours });
}
