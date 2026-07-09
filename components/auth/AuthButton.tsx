import Link from "next/link";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { UserDropdown } from "./UserDropdown";

export async function AuthButton() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return (
      <div className="flex gap-2">
        <Button asChild size="sm" variant="ghost" className="text-slate-400 hover:text-white hover:bg-white/[0.06] border border-white/10 hover:border-white/20">
          <Link href="/auth/login">Sign in</Link>
        </Button>
        <Button asChild size="sm" className="bg-gradient-to-r from-brand to-brandLight hover:from-brand-500 hover:to-brandLight-400 text-white border-0 shadow-lg shadow-brand/35 transition-all duration-200">
          <Link href="/auth/sign-up">Sign up</Link>
        </Button>
      </div>
    );
  }

  const { data: sub } = await supabaseAdmin
    .from("subscriptions")
    .select("status")
    .eq("user_id", user.id)
    .single();
  const isSubscribed = sub && ["active", "trialing"].includes(sub.status as string);

  return (
    <UserDropdown
      email={user.email ?? ""}
      isSubscribed={!!isSubscribed}
    />
  );
}
