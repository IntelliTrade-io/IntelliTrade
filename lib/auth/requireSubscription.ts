import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";

const ACTIVE_STATUSES = ["active", "trialing"];

/**
 * Gate for premium data API routes (audit H2–H5): resolves the caller's session
 * from cookies and requires an active Stripe subscription.
 *
 * Returns `null` when access is allowed, otherwise a ready-to-return 401/403
 * response. Usage in a route handler:
 *
 *   const denied = await requireSubscription();
 *   if (denied) return denied;
 *
 * Reads `subscriptions` through the cookie-scoped client, so it works with the
 * RLS user-scoped SELECT policy from migration 001.
 */
export async function requireSubscription(): Promise<NextResponse | null> {
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

  if (!sub || !ACTIVE_STATUSES.includes(sub.status as string)) {
    return NextResponse.json({ error: "Active subscription required" }, { status: 403 });
  }

  return null;
}
