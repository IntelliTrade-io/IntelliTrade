import Link from "next/link";
import { Button } from "./ui/button";
import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { LogoutButton } from "./logout-button";

export async function AuthButton() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return (
      <div className="flex gap-2">
        <Button asChild size="sm">
          <Link href="/auth/login">Sign in</Link>
        </Button>
        <Button asChild size="sm">
          <Link href="/auth/sign-up">Sign up</Link>
        </Button>
      </div>
    );
  }

  // Check if the user has an active subscription
  const { data: sub } = await supabaseAdmin
    .from("subscriptions")
    .select("status")
    .eq("user_id", user.id)
    .single();
  const isSubscribed = sub && ["active", "trialing"].includes(sub.status as string);

  return (
    <div className="flex items-center gap-3">
      {isSubscribed && (
        <Button asChild size="sm" variant="outline">
          <Link href="/dashboardv2">Dashboard</Link>
        </Button>
      )}
      <LogoutButton />
    </div>
  );
}
