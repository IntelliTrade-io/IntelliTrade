"use client";

import { useState } from "react";
import { UpgradeButton } from "./UpgradeButton";

// Monthly/annual plan selection on the upgrade page. The annual plan is
// env-gated server-side (STRIPE_PRICE_ID_ANNUAL): when the page passes no
// annual price this renders the original monthly-only layout unchanged.

export type PlanPrice = {
  /** Major units, e.g. 15 for €15.00. */
  amount: number;
  currency: string;
};

function symbol(currency: string): string {
  return currency === "EUR" ? "€" : currency === "USD" ? "$" : `${currency} `;
}

function formatAmount(amount: number): string {
  return Number.isInteger(amount) ? String(amount) : amount.toFixed(2);
}

export function PlanPicker({
  monthly,
  annual,
  isLoggedIn,
}: {
  monthly: PlanPrice;
  annual: PlanPrice | null;
  isLoggedIn: boolean;
}) {
  const [interval, setInterval] = useState<"monthly" | "annual">("monthly");
  const active = interval === "annual" && annual ? annual : monthly;

  // "Save €X a year" only when the annual price actually undercuts 12 months.
  const savings =
    annual && annual.currency === monthly.currency
      ? Math.round((monthly.amount * 12 - annual.amount) * 100) / 100
      : 0;

  return (
    <>
      {annual && (
        <div className="mb-5 inline-flex rounded-full border border-white/10 bg-black/30 p-1">
          {(["monthly", "annual"] as const).map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => setInterval(option)}
              className={`rounded-full px-4 py-1.5 text-xs font-semibold capitalize transition-all ${
                interval === option
                  ? "bg-violet-600 text-white shadow-[0_0_18px_rgba(139,92,246,0.35)]"
                  : "text-white/45 hover:text-white/70"
              }`}
            >
              {option}
              {option === "annual" && savings > 0 && (
                <span className="ml-1.5 text-[10px] font-medium text-violet-200/80">
                  save {symbol(monthly.currency)}{formatAmount(savings)}
                </span>
              )}
            </button>
          ))}
        </div>
      )}

      {/* Price */}
      <div className="mb-2 flex items-end gap-1">
        <span className="text-5xl font-bold tracking-tight text-white">
          {symbol(active.currency)}
          {formatAmount(active.amount)}
        </span>
        <span className="mb-1.5 text-white/40">
          {interval === "annual" && annual ? "/year" : "/month"}
        </span>
      </div>
      {interval === "annual" && annual ? (
        <p className="mb-1 text-sm text-white/55">
          One payment a year{savings > 0 ? ` — ${symbol(monthly.currency)}${formatAmount(savings)} less than paying monthly` : ""}.
        </p>
      ) : (
        <p className="mb-1 text-sm text-white/55">
          Founding price for the first 100 members; keep it for as long as you stay subscribed.
        </p>
      )}
      <p className="mb-8 text-sm text-white/40">
        Cancel anytime. No contracts.
      </p>

      <UpgradeButton isLoggedIn={isLoggedIn} interval={interval} value={active.amount} />
    </>
  );
}
