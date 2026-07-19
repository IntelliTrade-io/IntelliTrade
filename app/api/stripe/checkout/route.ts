import { NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";
import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

const baseUrl = process.env.NEXT_PUBLIC_SITE_URL
  ?? (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");

export async function POST() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Look up existing Stripe customer
  const { data: sub } = await supabaseAdmin
    .from("subscriptions")
    .select("stripe_customer_id")
    .eq("user_id", user.id)
    .single();

  let customerId = sub?.stripe_customer_id as string | undefined;

  if (!customerId) {
    const customer = await stripe.customers.create({
      email: user.email,
      metadata: { user_id: user.id },
    });
    customerId = customer.id;

    await supabaseAdmin.from("subscriptions").upsert(
      {
        user_id: user.id,
        stripe_customer_id: customerId,
        plan: "demo",
        status: "inactive",
      },
      { onConflict: "user_id" },
    );
  }

  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    mode: "subscription",
    payment_method_types: ["card"],
    line_items: [{ price: process.env.STRIPE_PRICE_ID!, quantity: 1 }],
    // Alpha access runs on Stripe promotion codes (100%-off coupon); this only
    // shows the code field, pricing is unchanged without a code.
    allow_promotion_codes: true,
    success_url: `${baseUrl}/upgrade/success`,
    cancel_url: `${baseUrl}/upgrade?canceled=true`,
    subscription_data: { metadata: { user_id: user.id } },
  });

  return NextResponse.json({ url: session.url });
}
