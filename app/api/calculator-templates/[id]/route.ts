import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { requireSubscription } from "@/lib/auth/requireSubscription";
import { templateFromRow, validateTemplateInput, type TemplateRow } from "@/lib/calculator-templates";

export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Update a template (rename, explicit "Update template", set default). Takes
 * the full template payload; ownership is enforced by RLS, entitlement by
 * requireSubscription plus the RLS mutation policies.
 */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireSubscription();
  if (denied) return denied;

  const { id } = await params;
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: "Invalid template id" }, { status: 400 });
  }

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

  if (input.isDefault) {
    await supabase
      .from("calculator_account_templates")
      .update({ is_default: false })
      .eq("user_id", user.id)
      .eq("is_default", true)
      .neq("id", id);
  }

  const { data, error } = await supabase
    .from("calculator_account_templates")
    .update({
      name: input.name,
      balance: input.balance,
      currency: input.currency,
      risk_percent: input.riskPercent,
      broker_name: input.brokerName,
      is_default: input.isDefault,
      instrument_overrides: input.instrumentOverrides,
    })
    .eq("id", id)
    .select("*")
    .maybeSingle();

  if (error) {
    if (error.code === "23505") {
      return NextResponse.json({ error: "You already have a template with that name." }, { status: 409 });
    }
    return NextResponse.json({ error: "Could not update template" }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: "Template not found" }, { status: 404 });
  }

  return NextResponse.json({ template: templateFromRow(data as TemplateRow) });
}

/** Delete a template. Pro only; the client confirms before calling. */
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireSubscription();
  if (denied) return denied;

  const { id } = await params;
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: "Invalid template id" }, { status: 400 });
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("calculator_account_templates")
    .delete()
    .eq("id", id)
    .select("id")
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: "Could not delete template" }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: "Template not found" }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
