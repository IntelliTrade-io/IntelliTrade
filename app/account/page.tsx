import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { redirect } from "next/navigation";
import AccountClient from "./AccountClient";

export const metadata = { title: "Account · IntelliTrade" };

export default async function AccountPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect("/auth/login");

  const { data: sub } = await supabaseAdmin
    .from("subscriptions")
    .select("status, stripe_customer_id")
    .eq("user_id", user.id)
    .single();

  const isActive = sub && ["active", "trialing"].includes(sub.status as string);
  const hasStripeCustomer = !!sub?.stripe_customer_id;

  return (
    <AccountClient
      email={user.email ?? ""}
      createdAt={user.created_at}
      subscriptionStatus={(sub?.status as string) ?? null}
      isActive={!!isActive}
      hasStripeCustomer={hasStripeCustomer}
    />
  );
}
