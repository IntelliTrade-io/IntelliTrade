import { stripe } from "@/lib/stripe";
import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { CheckCircle2, LayoutDashboard, CalendarDays, CandlestickChart, BookOpen, Gamepad2, FileText, Radar, Globe2, Calculator, LineChart } from "lucide-react";
import { PlanPicker, type PlanPrice } from "./_components/PlanPicker";
import { PricingBeacon } from "@/components/pro/PricingBeacon";
import Link from "next/link";
import { redirect } from "next/navigation";

const FEATURES = [
  { icon: LineChart,       label: "Smart Support Zones (EURUSD)", soon: false },
  { icon: LayoutDashboard, label: "Custom Trading Dashboard", soon: false },
  { icon: CandlestickChart, label: "TradingView charts",      soon: false },
  { icon: CalendarDays,    label: "Economic calendar",        soon: false },
  { icon: Calculator,      label: "Position size calculator", soon: false },
  { icon: Radar,           label: "Currency strength meter",  soon: false },
  { icon: FileText,        label: "Trading journal",          soon: false },
  { icon: BookOpen,        label: "Macro Mastery module",     soon: true  },
  { icon: Gamepad2,        label: "Bull vs Bear game",        soon: false },
  { icon: Globe2,          label: "Conflict map",             soon: true  },
];

export default async function UpgradePage({
  searchParams,
}: {
  searchParams: Promise<{ canceled?: string }>;
}) {
  const { canceled } = await searchParams;
  // Annual is env-gated: no STRIPE_PRICE_ID_ANNUAL → monthly-only page,
  // exactly as before. A retrieve failure on the annual price degrades the
  // same way instead of breaking the whole page.
  const annualPriceId = process.env.STRIPE_PRICE_ID_ANNUAL;
  const [supabase, price, annualPrice] = await Promise.all([
    createClient(),
    stripe.prices.retrieve(process.env.STRIPE_PRICE_ID!),
    annualPriceId ? stripe.prices.retrieve(annualPriceId).catch(() => null) : Promise.resolve(null),
  ]);

  const { data: { user } } = await supabase.auth.getUser();

  // If the user already has an active subscription, send them straight to the dashboard
  if (user) {
    const { data: sub } = await supabaseAdmin
      .from("subscriptions")
      .select("status")
      .eq("user_id", user.id)
      .single();
    const isActive = sub && ["active", "trialing"].includes(sub.status as string);
    if (isActive) redirect("/dashboardv2");
  }

  const monthly: PlanPrice = {
    amount: price.unit_amount ? price.unit_amount / 100 : 0,
    currency: price.currency.toUpperCase(),
  };
  const annual: PlanPrice | null = annualPrice?.unit_amount
    ? { amount: annualPrice.unit_amount / 100, currency: annualPrice.currency.toUpperCase() }
    : null;

  return (
    <div className="relative min-h-screen w-full px-4 py-20 text-white">
      <div className="mx-auto max-w-lg">

        {canceled && (
          <div className="mb-6 rounded-2xl border border-amber-400/20 bg-amber-400/[0.07] px-4 py-3 text-sm text-amber-300">
            Payment canceled; no charge was made. You can try again whenever you&apos;re ready.
          </div>
        )}

        {/* Card */}
        <div className="relative overflow-hidden rounded-[32px] border border-white/10 bg-[linear-gradient(180deg,rgba(12,12,16,0.82),rgba(7,7,10,0.88))] p-8 shadow-[0_28px_72px_rgba(0,0,0,0.5)] backdrop-blur-2xl">
          <div className="radial-backdrop" />

          {/* Violet glow */}
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_80%_10%,rgba(139,92,246,0.08),transparent_55%)]" />

          <div className="relative z-10">
            <PricingBeacon page="upgrade" />

            {/* Badge */}
            <div className="mb-6 inline-flex items-center rounded-full border border-violet-400/30 bg-violet-500/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-violet-300">
              IntelliTrade Pro · Founding Member
            </div>

            <PlanPicker monthly={monthly} annual={annual} isLoggedIn={!!user} />

            <div className="mt-3 text-center text-[11px] text-white/30">
              Powered by Stripe · Secured payment
            </div>

            {/* Divider */}
            <div className="my-8 border-t border-white/8" />

            {/* Features */}
            <p className="mb-4 text-xs font-semibold uppercase tracking-[0.2em] text-white/40">
              Everything included
            </p>
            <ul className="grid gap-3">
              {/* `soon` items hidden from the public page: under-construction
                  signals hurt ad-network/site reviews. Flip soon->false when
                  a module ships to list it again. */}
              {FEATURES.filter(({ soon }) => !soon).map(({ label, soon }) => (
                <li key={label} className="flex items-center gap-3 text-sm">
                  {/* Blurred portion — icon + label */}
                  <span className={`flex items-center gap-3 flex-1 ${soon ? "blur-[2px] select-none text-white/40" : "text-white/80"}`}>
                    <CheckCircle2 className={`h-4 w-4 shrink-0 ${soon ? "text-white/20" : "text-violet-400"}`} />
                    {label}
                  </span>
                  {/* Badge stays crisp */}
                  {soon && (
                    <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] font-medium uppercase tracking-widest text-white/40">
                      Coming soon
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        </div>

        <p className="mt-6 text-center text-xs text-white/28">
          Already subscribed?{" "}
          <Link href="/auth/login" className="underline hover:text-white/60">
            Sign in
          </Link>{" "}
          to access your dashboard.
        </p>
      </div>
    </div>
  );
}
