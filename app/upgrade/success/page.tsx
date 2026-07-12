import Link from "next/link";
import { CheckCircle2 } from "lucide-react";
import { PurchaseBeacon } from "./_components/PurchaseBeacon";

export default function UpgradeSuccessPage() {
  return (
    <div className="relative flex min-h-screen w-full items-center justify-center px-4 text-white">
      <PurchaseBeacon />
      <div className="relative w-full max-w-md overflow-hidden rounded-[32px] border border-white/10 bg-[linear-gradient(180deg,rgba(12,12,16,0.82),rgba(7,7,10,0.88))] p-10 text-center shadow-[0_28px_72px_rgba(0,0,0,0.5)] backdrop-blur-2xl">
        <div className="radial-backdrop" />
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(139,92,246,0.1),transparent_60%)]" />

        <div className="relative z-10">
          <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full border border-violet-400/20 bg-violet-500/10">
            <CheckCircle2 className="h-8 w-8 text-violet-400" />
          </div>

          <h1 className="mb-3 text-2xl font-semibold tracking-tight text-white">
            You&apos;re all set!
          </h1>
          <p className="mb-8 text-sm text-white/50">
            Your subscription is active. Welcome to IntelliTrade Pro.
          </p>

          <Link
            href="/dashboardv2"
            className="inline-flex w-full items-center justify-center rounded-full bg-violet-600 px-8 py-4 text-base font-semibold text-white shadow-[0_0_32px_rgba(139,92,246,0.35)] transition-all hover:bg-violet-500"
          >
            Open Dashboard V2
          </Link>
        </div>
      </div>
    </div>
  );
}
