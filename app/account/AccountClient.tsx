"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiPost } from "@/lib/api/client";
import { signOut, updatePassword } from "@/lib/auth/client";
import { User, CreditCard, Lock, LogOut, CheckCircle2, XCircle } from "lucide-react";

interface AccountClientProps {
  email: string;
  createdAt: string;
  subscriptionStatus: string | null;
  isActive: boolean;
  hasStripeCustomer: boolean;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="relative overflow-hidden rounded-[28px] border border-white/10 bg-[linear-gradient(180deg,rgba(12,12,16,0.82),rgba(7,7,10,0.88))] p-6 shadow-[0_28px_72px_rgba(0,0,0,0.5)] backdrop-blur-2xl">
      <div className="radial-backdrop" />
      <div className="relative z-10">
        <h2 className="mb-5 text-sm font-semibold uppercase tracking-[0.2em] text-white/40">{title}</h2>
        {children}
      </div>
    </div>
  );
}

export default function AccountClient({ email, createdAt, subscriptionStatus, isActive, hasStripeCustomer }: AccountClientProps) {
  const router = useRouter();
  const [portalLoading, setPortalLoading] = useState(false);
  const [portalError, setPortalError] = useState<string | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [pwStatus, setPwStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [pwError, setPwError] = useState<string | null>(null);

  const memberSince = new Date(createdAt).toLocaleDateString(undefined, {
    year: "numeric", month: "long", day: "numeric",
  });

  const statusLabel: Record<string, string> = {
    active: "Active",
    trialing: "Trial",
    canceled: "Canceled",
    past_due: "Past due",
    inactive: "Inactive",
  };

  const handleManageSubscription = async () => {
    setPortalLoading(true);
    setPortalError(null);
    try {
      const json = await apiPost<{ url?: string }>("/api/stripe/portal");
      window.open(json.url, "_blank");
    } catch (e: unknown) {
      setPortalError(e instanceof Error ? e.message : "Something went wrong");
      setPortalLoading(false);
    }
  };

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      setPwError("Passwords do not match");
      setPwStatus("error");
      return;
    }
    setPwStatus("loading");
    setPwError(null);
    try {
      await updatePassword(newPassword);
      setPwStatus("success");
      setNewPassword("");
      setConfirmPassword("");
    } catch (error: unknown) {
      setPwError(error instanceof Error ? error.message : "An error occurred");
      setPwStatus("error");
    }
  };

  const handleSignOut = async () => {
    await signOut();
    router.refresh();
    router.push("/");
  };

  return (
    <div className="mx-auto max-w-lg px-4 py-16 text-white">
      <div className="mb-8">
        <div className="inline-flex items-center rounded-full border border-brand/30 bg-white/5 px-4 py-1 text-[11px] font-medium tracking-[0.22em] text-brand/90 mb-4">
          INTELLITRADE
        </div>
        <h1 className="text-2xl font-semibold tracking-tight text-white">My account</h1>
      </div>

      <div className="space-y-4">
        {/* Account info */}
        <Section title="Account">
          <div className="flex items-center gap-3 mb-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/[0.05]">
              <User className="h-4 w-4 text-white/60" />
            </div>
            <div>
              <p className="text-sm font-medium text-white">{email}</p>
              <p className="text-xs text-white/40">Member since {memberSince}</p>
            </div>
          </div>
        </Section>

        {/* Subscription */}
        <Section title="Subscription">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/[0.05]">
                <CreditCard className="h-4 w-4 text-white/60" />
              </div>
              <div>
                <p className="text-sm font-medium text-white">
                  {isActive ? "IntelliTrade Pro" : "Free plan"}
                </p>
                {subscriptionStatus && (
                  <div className="flex items-center gap-1.5 mt-0.5">
                    {isActive
                      ? <CheckCircle2 className="h-3 w-3 text-emerald-400" />
                      : <XCircle className="h-3 w-3 text-white/30" />}
                    <span className={`text-xs ${isActive ? "text-emerald-400" : "text-white/40"}`}>
                      {statusLabel[subscriptionStatus] ?? subscriptionStatus}
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {hasStripeCustomer ? (
            <>
              <button
                onClick={handleManageSubscription}
                disabled={portalLoading}
                className="w-full h-10 rounded-xl border border-white/20 bg-white/[0.06] text-sm font-medium text-white transition-all hover:bg-white/[0.10] hover:border-white/30 disabled:opacity-50"
              >
                {portalLoading ? "Opening portal…" : "Manage subscription"}
              </button>
              {portalError && <p className="mt-2 text-xs text-red-400">{portalError}</p>}
            </>
          ) : (
            <a
              href="/upgrade"
              className="flex w-full h-10 items-center justify-center rounded-xl bg-gradient-to-r from-brand to-brandLight text-sm font-semibold text-white shadow-lg shadow-brand/35 transition-all hover:opacity-90"
            >
              Upgrade to Pro
            </a>
          )}
        </Section>

        {/* Password */}
        <Section title="Change password">
          <form onSubmit={handlePasswordChange} className="space-y-3">
            <div className="flex items-center gap-3 mb-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/[0.05]">
                <Lock className="h-4 w-4 text-white/60" />
              </div>
              <p className="text-sm text-white/50">Set a new password for your account</p>
            </div>
            <input
              type="password"
              placeholder="New password"
              required
              minLength={6}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="h-10 w-full rounded-xl border border-white/10 bg-white/[0.035] px-4 text-sm text-white placeholder:text-white/24 outline-none transition-all focus:border-violet-400/40 focus:bg-white/[0.05]"
            />
            <input
              type="password"
              placeholder="Confirm new password"
              required
              minLength={6}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="h-10 w-full rounded-xl border border-white/10 bg-white/[0.035] px-4 text-sm text-white placeholder:text-white/24 outline-none transition-all focus:border-violet-400/40 focus:bg-white/[0.05]"
            />
            <button
              type="submit"
              disabled={pwStatus === "loading" || !newPassword || !confirmPassword}
              className="w-full h-10 rounded-xl border border-white/20 bg-white/[0.06] text-sm font-medium text-white transition-all hover:bg-white/[0.10] hover:border-white/30 disabled:opacity-50"
            >
              {pwStatus === "loading" ? "Updating…" : "Update password"}
            </button>
            {pwStatus === "success" && <p className="text-xs text-emerald-400">Password updated.</p>}
            {pwError && <p className="text-xs text-red-400">{pwError}</p>}
          </form>
        </Section>

        {/* Sign out */}
        <button
          onClick={handleSignOut}
          className="w-full flex items-center justify-center gap-2 h-10 rounded-xl border border-white/10 bg-white/[0.03] text-sm text-white/50 transition-all hover:text-white hover:border-white/20"
        >
          <LogOut className="h-4 w-4" />
          Sign out
        </button>
      </div>
    </div>
  );
}
