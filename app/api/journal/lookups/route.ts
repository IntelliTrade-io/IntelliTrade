import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { requireSubscription } from "@/lib/auth/requireSubscription";
import { getTradeFormLookups } from "@/lib/journal/server";
import { requireAuthenticatedUser } from "@/lib/supabase/server";

const LookupCreateSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("account"),
    name: z.string().trim().min(1).max(120),
    broker: z.string().trim().max(120).nullable().optional(),
    base_currency: z.string().trim().length(3).transform((value) => value.toUpperCase()),
  }),
  z.object({
    kind: z.literal("instrument"),
    symbol: z.string().trim().min(1).max(40).transform((value) => value.toUpperCase()),
    asset_class: z.enum(["fx", "crypto", "equity", "index", "commodity"]),
    quote_currency: z.string().trim().length(3).transform((value) => value.toUpperCase()),
    contract_size: z.number().positive().default(1),
  }),
  z.object({
    kind: z.literal("strategy"),
    name: z.string().trim().min(1).max(120),
    description: z.string().trim().max(1000).nullable().optional(),
  }),
]);

async function context() {
  const denied = await requireSubscription();
  if (denied) return { denied };
  const auth = await requireAuthenticatedUser();
  return { ...auth, denied: null };
}

export async function GET() {
  const result = await context();
  if (result.denied) return result.denied;
  return NextResponse.json(await getTradeFormLookups(result.supabase!));
}

export async function POST(request: NextRequest) {
  const parsed = LookupCreateSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Journal prerequisite is invalid.", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const result = await context();
  if (result.denied) return result.denied;
  if (!result.user || !result.supabase) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  const { kind, ...fields } = parsed.data;
  const table =
    kind === "account" ? "accounts" : kind === "instrument" ? "instruments" : "strategies";
  const { data, error } = await result.supabase
    .from(table)
    .insert({ ...fields, user_id: result.user.id })
    .select("id")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ id: data.id, kind }, { status: 201 });
}
