import { createClient } from "@/lib/supabase/server";
import { type EmailOtpType } from "@supabase/supabase-js";
import { redirect } from "next/navigation";
import { type NextRequest } from "next/server";

// Destination of the sign-up confirmation email (lib/auth/client.ts
// emailRedirectTo). This route did not exist — depending on the Supabase email
// template, every confirmed sign-up could land on a 404. Handles both link
// styles defensively:
//   - {{ .ConfirmationURL }} templates arrive with ?code= (PKCE) → exchange
//     for a session;
//   - {{ .TokenHash }} templates arrive with ?token_hash=&type= → verify OTP
//     (same contract as /auth/confirm).
// Success lands on /upgrade: the free tier is thin by design — a fresh account
// exists to subscribe (conversion plan, locked decision 1).

// Only allow same-origin relative redirects (audit M11, same as /auth/confirm).
function safeNext(raw: string | null): string {
  if (!raw) return "/upgrade";
  if (!raw.startsWith("/") || raw.startsWith("//")) return "/upgrade";
  return raw;
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const token_hash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const next = safeNext(searchParams.get("next"));

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) redirect(next);
    redirect(`/auth/error?error=${encodeURIComponent(error.message)}`);
  }

  if (token_hash && type) {
    const supabase = await createClient();
    const { error } = await supabase.auth.verifyOtp({ type, token_hash });
    if (!error) redirect(next);
    redirect(`/auth/error?error=${encodeURIComponent(error.message)}`);
  }

  redirect(`/auth/error?error=${encodeURIComponent("Missing confirmation code")}`);
}
