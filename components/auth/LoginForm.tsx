"use client";

import { signInWithPassword } from "@/lib/auth/client";
import { trackEvent } from "@/lib/analytics";
import { safeRelativePath } from "@/lib/utils";
import Link from "next/link";
import { useState } from "react";

export function LoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);
    try {
      await signInWithPassword(email, password);
      trackEvent("login", { method: "password" });
      // Honor ?redirect= (relative-only, open-redirect safe); default dashboard.
      const redirect = safeRelativePath(
        new URLSearchParams(window.location.search).get("redirect"),
      );
      window.location.href = redirect ?? "/dashboardv2";
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
          <h1 className="text-2xl font-semibold tracking-tight text-white">Welcome back</h1>
          <p className="mt-1 text-sm text-white/50">Sign in to your account to continue</p>
        </div>

        <form onSubmit={handleLogin} className="space-y-5">
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
            <div className="flex items-center justify-between">
              <label htmlFor="password" className="block text-[11px] font-semibold uppercase tracking-[0.18em] text-white/46">
                Password
              </label>
              <Link href="/auth/forgot-password" className="text-[11px] text-white/40 hover:text-white transition-colors">
                Forgot password?
              </Link>
            </div>
            <input
              id="password"
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="h-11 w-full rounded-xl border border-white/10 bg-white/[0.035] px-4 text-sm text-white placeholder:text-white/24 outline-none transition-all focus:border-violet-400/40 focus:bg-white/[0.05]"
            />
          </div>

          {error && (
            <p className="text-sm text-red-400">{error}</p>
          )}

          <button
            type="submit"
            disabled={isLoading}
            className="mt-1 w-full h-11 rounded-xl bg-gradient-to-r from-brand to-brandLight text-sm font-semibold text-white shadow-lg shadow-brand/35 transition-all hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading ? "Signing in…" : "Sign in"}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-white/40">
          Don&apos;t have an account?{" "}
          <Link href="/auth/sign-up" className="text-white/70 hover:text-white transition-colors">
            Sign up
          </Link>
        </p>
      </div>
    </div>
  );
}
