import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { requireSubscription } from "@/lib/auth/requireSubscription";
import { buildTradeContext } from "@/lib/server/journal-context";
import {
  buildLegInsertRows,
  tradeFromRow,
  validateNewTrade,
  tradeStatus,
  realizedPnl,
  realizedStats,
  type JournalTradeRow,
  type JournalTradeLegRow,
} from "@/lib/journal-trades";

export const dynamic = "force-dynamic";

const ACTIVE_STATUSES = ["active", "trialing"];
const MAX_TRADES = 100;

/**
 * List the caller's trades (newest first) with their legs, plus server-computed
 * per-trade status/PnL and portfolio-level realized stats.
 *
 * Read access requires only authentication, not an active subscription (mirrors
 * migration 011's owner-only SELECT policy): a lapsed Pro user keeps read access
 * to their own journal. `canEdit` tells the client whether mutations would pass.
 */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  const { data: sub } = await supabase
    .from("subscriptions")
    .select("status")
    .eq("user_id", user.id)
    .single();
  const canEdit = Boolean(sub && ACTIVE_STATUSES.includes(sub.status as string));

  const { data: tradeData, error: tradeError } = await supabase
    .from("journal_trades")
    .select("*")
    .order("opened_at", { ascending: false })
    .limit(MAX_TRADES);
  if (tradeError) {
    return NextResponse.json({ error: "Could not load journal" }, { status: 500 });
  }
  const tradeRows = (tradeData ?? []) as JournalTradeRow[];

  // RLS scopes legs to the caller; restrict to the fetched trades to stay clear
  // of the PostgREST 1000-row cap and to skip legs of older, unlisted trades.
  const legsByTrade = new Map<string, JournalTradeLegRow[]>();
  if (tradeRows.length > 0) {
    const { data: legData, error: legError } = await supabase
      .from("journal_trade_legs")
      .select("*")
      .in(
        "trade_id",
        tradeRows.map((t) => t.id),
      )
      .order("executed_at", { ascending: true });
    if (legError) {
      return NextResponse.json({ error: "Could not load journal" }, { status: 500 });
    }
    for (const leg of (legData ?? []) as JournalTradeLegRow[]) {
      const arr = legsByTrade.get(leg.trade_id);
      if (arr) arr.push(leg);
      else legsByTrade.set(leg.trade_id, [leg]);
    }
  }

  const trades = tradeRows.map((row) => {
    const trade = tradeFromRow(row, legsByTrade.get(row.id) ?? []);
    return {
      ...trade,
      status: tradeStatus(trade.bias, trade.legs),
      netPnl: realizedPnl(trade.bias, trade.legs),
    };
  });

  const stats = realizedStats(trades.map((t) => ({ bias: t.bias, legs: t.legs })));

  return NextResponse.json({ trades, stats, canEdit });
}

/** Create a trade with its legs. Pro only (enforced here and by RLS). */
export async function POST(req: Request) {
  const denied = await requireSubscription();
  if (denied) return denied;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const validated = validateNewTrade(body);
  if (!validated.ok) {
    return NextResponse.json({ error: validated.error }, { status: 400 });
  }
  const input = validated.value;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  // Auto-capture what IntelliTrade's meters read now. Never throws; degrades to
  // a { v, capturedAt } stamp when the snapshot tables are unavailable.
  const context = await buildTradeContext(input.symbol);

  const tradeInsert: Record<string, unknown> = {
    user_id: user.id,
    symbol: input.symbol,
    bias: input.bias,
    setup: input.setup,
    thesis: input.thesis,
    risk_per_trade: input.riskPerTrade,
    target_r: input.targetR,
    tags: input.tags,
    context,
  };
  if (input.openedAt) tradeInsert.opened_at = input.openedAt;

  const { data: tradeData, error: tradeError } = await supabase
    .from("journal_trades")
    .insert(tradeInsert)
    .select("*")
    .single();
  if (tradeError || !tradeData) {
    return NextResponse.json({ error: "Could not save trade" }, { status: 500 });
  }
  const tradeRow = tradeData as JournalTradeRow;

  // Uniform key set across all rows (PGRST102 guard) — executed_at always present.
  const legInserts = buildLegInsertRows(input.legs, tradeRow.id, user.id, new Date().toISOString());

  const { data: legData, error: legError } = await supabase
    .from("journal_trade_legs")
    .insert(legInserts)
    .select("*");
  if (legError || !legData) {
    // No DB transaction across two statements; best-effort roll back the trade
    // so we never leave a legless trade behind.
    await supabase.from("journal_trades").delete().eq("id", tradeRow.id);
    return NextResponse.json({ error: "Could not save trade legs" }, { status: 500 });
  }

  const trade = tradeFromRow(tradeRow, legData as JournalTradeLegRow[]);
  return NextResponse.json({ trade }, { status: 201 });
}
