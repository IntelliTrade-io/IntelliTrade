import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// Maps each filename the meter fetches → which Supabase row to query
type RouteConfig = { type: "daily" | "intraday"; shape: "pairs" | "currencies" };

const ROUTE_MAP: Record<string, RouteConfig> = {
  "heatmap_pairs_v152.json":        { type: "daily",    shape: "pairs" },
  "heatmap_currencies_v152.json":   { type: "daily",    shape: "currencies" },
  "intraday_pairs_trusted.json":    { type: "intraday", shape: "pairs" },
  "intraday_currencies_trusted.json":{ type: "intraday", shape: "currencies" },
  // History files fetched by the intraday bundle — not yet produced by scanner,
  // return empty structures so the meter doesn't crash.
  "intraday_history_trusted.json":          { type: "intraday", shape: "pairs" },
  "intraday_snapshots_trusted.json":        { type: "intraday", shape: "pairs" },
  "intraday_strength_history_trusted.json": { type: "intraday", shape: "pairs" },
};

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ slug: string[] }> }
) {
  const { slug } = await params;
  const filename = slug.join("/");
  const config = ROUTE_MAP[filename];

  if (!config) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const { data, error } = await supabase
    .from("currency_strength_snapshots")
    .select("run_info, pairs, currencies_raw, currencies_weighted")
    .eq("type", config.type)
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  if (error || !data) {
    // History files are optional — return empty rather than 503
    if (filename.includes("history") || filename.includes("snapshots")) {
      return NextResponse.json(
        { run_info: { ts_utc: null }, pairs: {}, currencies_raw: {}, currencies_weighted: {} },
        { headers: corsHeaders() }
      );
    }
    return NextResponse.json({ error: "No snapshot available yet" }, { status: 503 });
  }

  const body =
    config.shape === "pairs"
      ? { run_info: data.run_info, pairs: data.pairs }
      : { currencies_raw: data.currencies_raw, currencies_weighted: data.currencies_weighted };

  return NextResponse.json(body, {
    headers: {
      ...corsHeaders(),
      "Cache-Control": "public, s-maxage=300, stale-while-revalidate=60",
    },
  });
}

function corsHeaders() {
  // The iframes load from the same origin, but allow cross-origin just in case
  return { "Access-Control-Allow-Origin": "*" };
}
