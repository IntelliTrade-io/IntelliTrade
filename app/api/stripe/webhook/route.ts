import { NextRequest, NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";
import { supabaseAdmin } from "@/lib/supabase/admin";
import type Stripe from "stripe";

export async function POST(req: NextRequest) {
  const body = await req.text();
  const sig = req.headers.get("stripe-signature");

  if (!sig) {
    return NextResponse.json({ error: "Missing signature" }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET!);
  } catch {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  switch (event.type) {
    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted": {
      await syncSubscription(event.data.object as Stripe.Subscription);
      break;
    }
  }

  return NextResponse.json({ received: true });
}

async function syncSubscription(subscription: Stripe.Subscription) {
  const customerId = subscription.customer as string;
  const isActive = ["active", "trialing"].includes(subscription.status);

  // Find the user who owns this customer
  const { data: existing } = await supabaseAdmin
    .from("subscriptions")
    .select("user_id")
    .eq("stripe_customer_id", customerId)
    .single();

  const userId = existing?.user_id ?? (subscription.metadata?.user_id as string | undefined);
  if (!userId) return;

  // current_period_end moved off the top-level subscription object in newer Stripe
  // API versions — fall back to the first item's billing period if not present.
  const rawSub = subscription as unknown as {
    current_period_end?: number;
    items?: { data?: Array<{ current_period_end?: number }> };
  };
  const periodEndSeconds: number | undefined =
    rawSub.current_period_end ??
    rawSub.items?.data?.[0]?.current_period_end;

  const current_period_end = periodEndSeconds
    ? new Date(periodEndSeconds * 1000).toISOString()
    : null;

  await supabaseAdmin.from("subscriptions").upsert(
    {
      user_id: userId,
      stripe_customer_id: customerId,
      stripe_subscription_id: subscription.id,
      plan: isActive ? "pro" : "demo",
      status: subscription.status,
      current_period_end,
    },
    { onConflict: "user_id" },
  );
}
