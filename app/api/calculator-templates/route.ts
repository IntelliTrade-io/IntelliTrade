import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { requireSubscription } from "@/lib/auth/requireSubscription";
import { templateFromRow, validateTemplateInput, type TemplateRow } from "@/lib/calculator-templates";

export const dynamic = "force-dynamic";

const ACTIVE_STATUSES = ["active", "trialing"];

/**
 * List the caller's calculator account templates.
 *
 * Read access requires only authentication, not an active subscription: a
 * lapsed Pro user keeps read-only access to templates they created (mirrors
 * the product's expired-subscription behaviour; templates are never deleted
 * on lapse). `canEdit` tells the client whether mutations would be accepted.
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

  const { data, error } = await supabase
    .from("calculator_account_templates")
    .select("*")
    .order("created_at", { ascending: true });
  if (error) {
    return NextResponse.json({ error: "Could not load templates" }, { status: 500 });
  }

  return NextResponse.json({
    templates: (data as TemplateRow[]).map(templateFromRow),
    canEdit,
  });
}

/** Create a template. Pro only (enforced here and by RLS). */
export async function POST(req: Request) {
  const denied = await requireSubscription();
  if (denied) return denied;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const validated = validateTemplateInput(body);
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

  // A new default replaces any existing one (partial unique index allows one).
  if (input.isDefault) {
    await supabase
      .from("calculator_account_templates")
      .update({ is_default: false })
      .eq("user_id", user.id)
      .eq("is_default", true);
  }

  const { data, error } = await supabase
    .from("calculator_account_templates")
    .insert({
      user_id: user.id,
      name: input.name,
      balance: input.balance,
      currency: input.currency,
      risk_percent: input.riskPercent,
      broker_name: input.brokerName,
      is_default: input.isDefault,
      instrument_overrides: input.instrumentOverrides,
    })
    .select("*")
    .single();

  if (error) {
    if (error.code === "23505") {
      return NextResponse.json({ error: "You already have a template with that name." }, { status: 409 });
    }
    return NextResponse.json({ error: "Could not save template" }, { status: 500 });
  }

  return NextResponse.json({ template: templateFromRow(data as TemplateRow) }, { status: 201 });
}
