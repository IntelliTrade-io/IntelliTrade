"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { apiPost } from "@/lib/api/client";
import { trackEvent } from "@/lib/analytics";

export function UpgradeButton({
  isLoggedIn,
  interval = "monthly",
  value = 15,
}: {
  isLoggedIn: boolean;
  interval?: "monthly" | "annual";
  value?: number;
}) {
  const [loading, setLoading] = useState(false);

  const handleClick = async () => {
    if (!isLoggedIn) {
      // No account yet → create one, then return to the upgrade offer.
      window.location.href = "/auth/sign-up?redirect=/upgrade";
      return;
    }

    trackEvent("begin_checkout", { currency: "EUR", value, interval });
    setLoading(true);
    try {
      const { url } = await apiPost<{ url?: string }>("/api/stripe/checkout", { interval });
      if (url) window.location.href = url;
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      onClick={handleClick}
      disabled={loading}
      className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-violet-600 px-8 py-4 text-base font-semibold text-white shadow-[0_0_32px_rgba(139,92,246,0.35)] transition-all hover:bg-violet-500 hover:shadow-[0_0_40px_rgba(139,92,246,0.5)] disabled:opacity-60"
    >
      {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : null}
      {loading ? "Redirecting to checkout…" : isLoggedIn ? "Subscribe now" : "Create your account to subscribe"}
    </button>
  );
}

export function ManageBillingButton() {
  const [loading, setLoading] = useState(false);

  const handleClick = async () => {
    setLoading(true);
    try {
      const { url } = await apiPost<{ url?: string }>("/api/stripe/portal");
      if (url) window.location.href = url;
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      onClick={handleClick}
      disabled={loading}
      className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-5 py-2.5 text-sm text-white/70 transition-all hover:border-white/18 hover:text-white disabled:opacity-60"
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
      {loading ? "Loading…" : "Manage billing"}
    </button>
  );
}
