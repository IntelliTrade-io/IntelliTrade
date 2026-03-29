import Link from "next/link";
import { BookOpen } from "lucide-react";
import LotSizeCalculator from "@/components/lot-size-calculator-2";

export const metadata = {
  title: "IntelliTrade · Lot Size Calculator",
  description: "Risk-adjusted position sizing with live exchange rates.",
};

export default function Page() {
  return (
    <div className="mx-auto max-w-4xl px-4 pb-16 pt-10 sm:px-8">
      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="inline-flex items-center rounded-full border border-white/12 bg-white/[0.03] px-4 py-2 text-[11px] font-medium uppercase tracking-[0.28em] text-white/72">
            IntelliTrade tools
          </div>
          <h1 className="mt-4 text-3xl font-semibold tracking-tight text-white sm:text-4xl">
            Lot size calculator
          </h1>
          <p className="mt-2 max-w-xl text-sm leading-relaxed text-white/46 sm:text-base">
            Enter your account balance, risk, and stop loss to get the correct position size with live exchange rates.
          </p>
        </div>
        <Link
          href="/lotsizecalculator/faq"
          className="inline-flex shrink-0 items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-5 py-2.5 text-sm text-white/70 transition-all hover:border-white/18 hover:text-white"
        >
          <BookOpen className="h-4 w-4" />
          Guide &amp; FAQ
        </Link>
      </div>

      <div className="relative overflow-hidden rounded-3xl border border-white/20 bg-clip-padding p-6 shadow-[0_32px_80px_rgba(0,0,0,0.85)] md:p-10">
        <div className="radial-backdrop" />
        <div className="relative z-10">
          <LotSizeCalculator />
        </div>
      </div>
    </div>
  );
}
