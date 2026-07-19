"use client";

import { useState } from "react";
import { Mail, ArrowRight, Check } from "lucide-react";
import { apiPost } from "@/lib/api/client";
import type { NewsletterSource } from "@/lib/newsletter";

// Email capture for the weekly strength digest. Free-tier surfaces only —
// never render inside Pro/dashboard chrome. Copy is measurement-framing:
// a recap of what happened, never signals.

export function NewsletterSignup({ source }: { source: NewsletterSource }) {
  const [email, setEmail] = useState("");
  const [website, setWebsite] = useState(""); // honeypot — hidden from real users
  const [state, setState] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (state === "loading" || state === "done") return;
    setState("loading");
    setMessage(null);
    try {
      await apiPost("/api/newsletter/subscribe", { email, source, website });
      setState("done");
    } catch (err) {
      setState("error");
      setMessage(err instanceof Error ? err.message : "Could not subscribe right now");
    }
  }

  return (
    <div className="relative overflow-hidden rounded-3xl border border-white/20 bg-clip-padding p-6 shadow-[0_32px_80px_rgba(0,0,0,0.85)] md:p-8">
      <div className="radial-backdrop" />
      <div className="relative z-10">
        <div className="flex items-center gap-2">
          <Mail className="h-4 w-4 text-brand/80" />
          <h2 className="text-lg font-semibold text-white">The weekly strength recap</h2>
        </div>
        <p className="mt-2 max-w-xl text-sm leading-relaxed text-white/55">
          One email a week: which currency led, which faded, and the week&apos;s regime
          changes — measured from the same data behind this page. Free, no spam,
          unsubscribe anytime.
        </p>

        {state === "done" ? (
          <p className="mt-4 inline-flex items-center gap-2 rounded-full border border-teal-400/25 bg-teal-500/10 px-4 py-2 text-sm text-teal-300/90">
            <Check className="h-4 w-4" />
            You&apos;re on the list.
          </p>
        ) : (
          <form onSubmit={submit} className="mt-4 flex max-w-md flex-col gap-2 sm:flex-row">
            {/* Honeypot: hidden from people, filled by bots. */}
            <input
              type="text"
              name="website"
              value={website}
              onChange={(e) => setWebsite(e.target.value)}
              tabIndex={-1}
              autoComplete="off"
              aria-hidden="true"
              className="absolute -left-[9999px] h-0 w-0 opacity-0"
            />
            <label htmlFor={`newsletter-email-${source}`} className="sr-only">
              Email address
            </label>
            <input
              id={`newsletter-email-${source}`}
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="h-11 min-w-0 flex-1 rounded-full border border-white/15 bg-black/30 px-4 text-sm text-white placeholder:text-white/30 outline-none transition focus:border-white/35"
            />
            <button
              type="submit"
              disabled={state === "loading"}
              className="inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-full bg-gradient-to-r from-brand to-brandLight px-5 text-sm font-semibold text-white shadow-lg shadow-brand/35 transition-all hover:opacity-90 disabled:opacity-60"
            >
              {state === "loading" ? "Subscribing…" : "Subscribe"}
              <ArrowRight className="h-4 w-4" />
            </button>
          </form>
        )}

        {state === "error" && message && (
          <p className="mt-2 text-xs text-red-300/80">{message}</p>
        )}

        <p className="mt-3 text-[11px] leading-relaxed text-white/30">
          Historical measurement, not trade recommendations. We only use your email for
          this recap.
        </p>
      </div>
    </div>
  );
}
