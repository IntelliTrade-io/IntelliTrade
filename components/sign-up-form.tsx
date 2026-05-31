"use client";

import { createClient } from "@/lib/supabase/client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function SignUpForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [repeatPassword, setRepeatPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    const supabase = createClient();
    setIsLoading(true);
    setError(null);

    if (password !== repeatPassword) {
      setError("Passwords do not match");
      setIsLoading(false);
      return;
    }

    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/auth/callback`,
        },
      });
      if (error) throw error;
      if (data.session) {
        router.refresh();
        router.push("/upgrade");
      } else {
        router.push("/auth/sign-up-success");
      }
    } catch (error: unknown) {
      setError(error instanceof Error ? error.message : "An error occurred");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="relative overflow-hidden rounded-3xl border border-white/20 bg-clip-padding p-8 shadow-[0_32px_80px_rgba(0,0,0,0.85)]">
      <div className="radial-backdrop" />
      <div className="relative z-10">
        <div className="mb-8">
          <h1 className="text-2xl font-semibold tracking-tight text-white">Create account</h1>
          <p className="mt-1 text-sm text-white/50">Start your IntelliTrade journey</p>
        </div>

        <form onSubmit={handleSignUp} className="space-y-5">
          <div className="space-y-1.5">
            <label htmlFor="email" className="block text-[11px] font-semibold uppercase tracking-[0.18em] text-white/46">
              Email
            </label>
            <input
              id="email"
              type="email"
              placeholder="you@domain.com"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="h-11 w-full rounded-xl border border-white/10 bg-white/[0.035] px-4 text-sm text-white placeholder:text-white/24 outline-none transition-all focus:border-violet-400/40 focus:bg-white/[0.05]"
            />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="password" className="block text-[11px] font-semibold uppercase tracking-[0.18em] text-white/46">
              Password
            </label>
            <input
              id="password"
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="h-11 w-full rounded-xl border border-white/10 bg-white/[0.035] px-4 text-sm text-white placeholder:text-white/24 outline-none transition-all focus:border-violet-400/40 focus:bg-white/[0.05]"
            />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="repeat-password" className="block text-[11px] font-semibold uppercase tracking-[0.18em] text-white/46">
              Repeat password
            </label>
            <input
              id="repeat-password"
              type="password"
              required
              value={repeatPassword}
              onChange={(e) => setRepeatPassword(e.target.value)}
              className="h-11 w-full rounded-xl border border-white/10 bg-white/[0.035] px-4 text-sm text-white placeholder:text-white/24 outline-none transition-all focus:border-violet-400/40 focus:bg-white/[0.05]"
            />
          </div>

          {error && <p className="text-sm text-red-400">{error}</p>}

          <button
            type="submit"
            disabled={isLoading}
            className="mt-1 w-full h-11 rounded-xl bg-gradient-to-r from-brand to-brandLight text-sm font-semibold text-white shadow-lg shadow-brand/35 transition-all hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading ? "Creating account…" : "Sign up"}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-white/40">
          Already have an account?{" "}
          <Link href="/auth/login" className="text-white/70 hover:text-white transition-colors">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
