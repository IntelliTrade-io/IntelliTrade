import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { requireSubscription } from "@/lib/auth/requireSubscription";
import {
  tradeFromRow,
  validateReplaceLegs,
  type JournalTrade,
  type JournalTradeRow,
  type JournalTradeLegRow,
} from "@/lib/journal-trades";

export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type CookieClient = Awaited<ReturnType<typeof createClient>>;

async function fetchTradeWithLegs(supabase: CookieClient, id: string): Promise<JournalTrade | null> {
  const { data: row } = await supabase.from("journal_trades").select("*").eq("id", id).maybeSingle();
  if (!row) return null;
  const { data: legs } = await supabase
    .from("journal_trade_legs")
    .select("*")
    .eq("trade_id", id)
    .order("executed_at", { ascending: true });
  return tradeFromRow(row as JournalTradeRow, (legs ?? []) as JournalTradeLegRow[]);
}

/**
 * Replace a trade's full leg set (the only leg mutation — legs are immutable
 * executions edited wholesale). There is no cross-statement transaction: the
 * delete and insert are separate, so an insert failure is reported honestly and
 * NOT dressed up as atomic.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireSubscription();
  if (denied) return denied;

  const { id } = await params;
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: "Invalid trade id" }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const validated = validateReplaceLegs(body);
  if (!validated.ok) {
    return NextResponse.json({ error: validated.error }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  // Confirm the trade exists and is the caller's (RLS makes others' rows
  // invisible), so we never delete legs for a non-existent/foreign trade.
  const { data: tradeRow } = await supabase
    .from("journal_trades")
    .select("id")
    .eq("id", id)
    .maybeSingle();
  if (!tradeRow) {
    return NextResponse.json({ error: "Trade not found" }, { status: 404 });
  }

  const { error: deleteError } = await supabase.from("journal_trade_legs").delete().eq("trade_id", id);
  if (deleteError) {
    return NextResponse.json({ error: "Could not replace trade legs" }, { status: 500 });
  }

  const legInserts = validated.value.legs.map((leg) => {
    const row: Record<string, unknown> = {
      trade_id: id,
      user_id: user.id,
      side: leg.side,
      qty: leg.qty,
      price: leg.price,
      fee: leg.fee,
    };
    if (leg.executedAt) row.executed_at = leg.executedAt;
    return row;
  });

  const { error: insertError } = await supabase.from("journal_trade_legs").insert(legInserts).select("id");
  if (insertError) {
    // The delete already applied; the previous legs are gone and the new set was
    // not saved. Report the true state rather than pretending atomicity.
    return NextResponse.json(
      {
        error:
          "The previous legs were removed but the new legs could not be saved. Please re-submit the leg set.",
      },
      { status: 500 },
    );
  }

  const trade = await fetchTradeWithLegs(supabase, id);
  if (!trade) {
    return NextResponse.json({ error: "Trade not found" }, { status: 404 });
  }
  return NextResponse.json({ trade });
}
