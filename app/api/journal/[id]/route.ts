import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { requireSubscription } from "@/lib/auth/requireSubscription";
import {
  tradeFromRow,
  validateTradeUpdate,
  type JournalTrade,
  type JournalTradeRow,
  type JournalTradeLegRow,
} from "@/lib/journal-trades";

export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type CookieClient = Awaited<ReturnType<typeof createClient>>;

/** Re-fetch a trade with its legs through the cookie-scoped (RLS) client. */
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
 * Patch a trade's editable fields (notes/tags/risk/close time). Ownership is
 * enforced by RLS (.eq on id is enough — a non-owner's row is invisible),
 * entitlement by requireSubscription plus the RLS mutation policies.
 */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
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
  const validated = validateTradeUpdate(body);
  if (!validated.ok) {
    return NextResponse.json({ error: validated.error }, { status: 400 });
  }
  const v = validated.value;

  // Only keys the payload actually carried (validateTradeUpdate guarantees ≥1).
  const update: Record<string, unknown> = {};
  if ("setup" in v) update.setup = v.setup;
  if ("thesis" in v) update.thesis = v.thesis;
  if ("riskPerTrade" in v) update.risk_per_trade = v.riskPerTrade;
  if ("targetR" in v) update.target_r = v.targetR;
  if ("tags" in v) update.tags = v.tags;
  if ("closedAt" in v) update.closed_at = v.closedAt;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("journal_trades")
    .update(update)
    .eq("id", id)
    .select("id")
    .maybeSingle();
  if (error) {
    return NextResponse.json({ error: "Could not update trade" }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: "Trade not found" }, { status: 404 });
  }

  const trade = await fetchTradeWithLegs(supabase, id);
  if (!trade) {
    return NextResponse.json({ error: "Trade not found" }, { status: 404 });
  }
  return NextResponse.json({ trade });
}

/** Delete a trade. Legs cascade at the DB (ON DELETE CASCADE). Pro only. */
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireSubscription();
  if (denied) return denied;

  const { id } = await params;
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: "Invalid trade id" }, { status: 400 });
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("journal_trades")
    .delete()
    .eq("id", id)
    .select("id")
    .maybeSingle();
  if (error) {
    return NextResponse.json({ error: "Could not delete trade" }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: "Trade not found" }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
