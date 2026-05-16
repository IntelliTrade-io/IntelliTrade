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

  const { data: sub } = await supabaseAdmin
    .from("subscriptions")
    .select("stripe_customer_id")
    .eq("user_id", user.id)
    .single();

  if (!sub?.stripe_customer_id) {
    return NextResponse.json({ error: "No billing account found" }, { status: 404 });
  }

  const session = await stripe.billingPortal.sessions.create({
    customer: sub.stripe_customer_id as string,
    return_url: `${baseUrl}/dashboardv2`,
  });

  return NextResponse.json({ url: session.url });
}
