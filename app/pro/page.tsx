import type { Metadata } from "next";
import { jsonLd } from "@/lib/jsonLd";
import Link from "next/link";
import {
  ArrowRight, ChevronDown, Check, Minus,
  LineChart, Radar, CalendarDays, CandlestickChart, Calculator, Gamepad2,
  ShieldCheck, CreditCard,
} from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { TrackedLink } from "@/components/layout/TrackedLink";
import { PricingBeacon } from "@/components/pro/PricingBeacon";
import { ZoneOverlayShowcase } from "@/components/support-resistance/ZoneOverlayShowcase";

export const metadata: Metadata = {
  title: "IntelliTrade Pro — Your Pre-Trade Routine In One Workspace",
  description:
    "IntelliTrade Pro brings together Smart Support Zones, currency strength, the economic calendar, charts and risk tools. Founding Member — €15/month for the first 100 members.",
  alternates: { canonical: "https://intellitrade.tech/pro" },
  openGraph: {
    title: "IntelliTrade Pro — Your Pre-Trade Routine In One Workspace",
    description:
      "Smart Support Zones, currency strength, event risk and position sizing in one workspace. Founding Member — €15/month, first 100 members.",
    url: "https://intellitrade.tech/pro",
    siteName: "IntelliTrade",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "IntelliTrade Pro — Your Pre-Trade Routine In One Workspace",
    description:
      "Smart Support Zones, currency strength, event risk and position sizing in one workspace. Founding Member — €15/month.",
  },
};

const FEATURES = [
  { icon: LineChart, label: "Smart Support Zones (EURUSD)", desc: "Support zones scored weak, medium or strong, with reclaim confirmation and an explained opportunity score." },
  { icon: Radar, label: "Currency Strength Meter", desc: "See which currencies are strong or weak across daily and intraday trends — before you pick a pair." },
  { icon: CalendarDays, label: "Economic Calendar", desc: "A clean view of the events that can move markets, so nothing catches your session by surprise." },
  { icon: CandlestickChart, label: "TradingView Charts", desc: "Full charting inside the workspace, alongside your context tools." },
  { icon: Calculator, label: "Position Size Calculator", desc: "Size every position to your risk with live conversion — the free tool, built into your routine." },
  { icon: Gamepad2, label: "Bull vs Bear", desc: "A fast trading minigame for the moments between preparation. Members only." },
];

const COMPARISON: { label: string; free: boolean; pro: boolean }[] = [
  { label: "Lot size calculator", free: true, pro: true },
  { label: "Prices today (Gold, Silver, Oil, Bitcoin)", free: true, pro: true },
  { label: "Macro blog", free: true, pro: true },
  { label: "Smart Support Zones (EURUSD)", free: false, pro: true },
  { label: "Currency strength meter", free: false, pro: true },
  { label: "Economic calendar", free: false, pro: true },
  { label: "TradingView charts in-workspace", free: false, pro: true },
  { label: "Bull vs Bear", free: false, pro: true },
];

const FAQ: { q: string; a: string }[] = [
  {
    q: "What exactly is included in IntelliTrade Pro?",
    a: "Everything in the Pro workspace: Smart Support Zones (EURUSD zone-strength scoring), the currency strength meter (daily and intraday), the economic calendar, TradingView charting, the position size calculator, and the Bull vs Bear game. New Pro tools are added to the same subscription.",
  },
  {
    q: "How does billing and cancellation work?",
    a: "€15 per month, billed through Stripe. Cancel anytime from your account page — access continues until the end of the paid period. No contracts, no cancellation emails, no retention hoops.",
  },
  {
    q: "How does Founding Member pricing work?",
    a: "The first 100 Pro members join at €15/month and keep that price for as long as their subscription stays active. If you cancel and rejoin later, the standard price at that time applies. After the first 100 members, new members join at the standard price.",
  },
  {
    q: "Is this a signal service?",
    a: "No. IntelliTrade provides educational market context and analytics to support your own decision process. It does not provide trade recommendations, entries, or financial advice. If you are looking for someone to tell you what to trade, this is not that — deliberately.",
  },
];

const webPageSchema = {
  "@context": "https://schema.org",
  "@type": "WebPage",
  name: "IntelliTrade Pro",
  description:
    "IntelliTrade Pro brings together Smart Support Zones, currency strength, the economic calendar, charts and risk tools in one pre-trade workspace.",
  url: "https://intellitrade.tech/pro",
  publisher: { "@type": "Organization", name: "IntelliTrade", url: "https://intellitrade.tech" },
};

const faqSchema = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: FAQ.map(({ q, a }) => ({
    "@type": "Question",
    name: q,
    acceptedAnswer: { "@type": "Answer", text: a },
  })),
};

// Resolve the CTA target + label from auth/subscription state.
async function resolveCta(): Promise<{ href: string; label: string; founding: boolean }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { href: "/auth/sign-up?redirect=/upgrade", label: "Become a Founding Member — €15/month", founding: true };
  }
  // User-scoped read (RLS SELECT policy) — never the admin client on a public page.
  const { data: sub } = await supabase
    .from("subscriptions")
    .select("status")
    .eq("user_id", user.id)
    .single();
  const isActive = sub && ["active", "trialing"].includes(sub.status as string);
  if (isActive) {
    return { href: "/dashboardv2", label: "Open your dashboard", founding: false };
  }
  return { href: "/upgrade", label: "Become a Founding Member — €15/month", founding: true };
}

function CtaButton({ cta, location, size = "lg" }: { cta: Awaited<ReturnType<typeof resolveCta>>; location: string; size?: "lg" | "md" }) {
  const pad = size === "lg" ? "px-7 py-3.5 text-base" : "px-6 py-3 text-sm";
  return (
    <TrackedLink
      href={cta.href}
      event={cta.founding ? "founding_cta_click" : "cta_click"}
      params={cta.founding ? { location } : { cta_id: location, destination: cta.href }}
      className={`inline-flex items-center gap-2 rounded-full bg-violet-600 ${pad} font-semibold text-white shadow-[0_0_32px_rgba(139,92,246,0.35)] transition-all hover:bg-violet-500`}
    >
      {cta.label}
      <ArrowRight className="h-4 w-4" />
    </TrackedLink>
  );
}

export default async function ProPage() {
  const cta = await resolveCta();

  return (
    <div className="w-full px-4 pb-24 pt-16 sm:px-6">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(webPageSchema) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(faqSchema) }} />

      <div className="mx-auto max-w-5xl">
        {/* ── Hero ── */}
        <section className="mb-20 text-center">
          <div className="inline-flex items-center rounded-full border border-violet-400/30 bg-violet-500/10 px-4 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-violet-300 mb-6">
            IntelliTrade Pro
          </div>
          <h1 className="text-4xl sm:text-6xl font-bold tracking-tight text-white leading-tight mb-6">
            Your pre-trade routine,<br className="hidden sm:block" /> in one workspace.
          </h1>
          <p className="text-base sm:text-lg text-white/50 max-w-2xl mx-auto mb-10 leading-relaxed">
            IntelliTrade Pro brings together Smart Support Zones, currency strength, the economic calendar,
            charts and risk tools — so every session starts with context instead of guesswork.
          </p>
          <CtaButton cta={cta} location="pro_hero" />
          <p className="mt-3 text-[11px] text-white/30">Cancel anytime · No contracts · Powered by Stripe</p>
        </section>

        {/* ── SSZ flagship ── */}
        <section className="mb-20">
          <div className="grid items-center gap-8 lg:grid-cols-2">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-violet-300/80 mb-3">
                Flagship · Smart Support Zones
              </p>
              <h2 className="text-2xl sm:text-4xl font-semibold tracking-tight text-white mb-4 leading-tight">
                Most tools draw zones. IntelliTrade scores them.
              </h2>
              <p className="text-sm sm:text-base text-white/50 leading-relaxed mb-6">
                Smart Support Zones evaluates every EURUSD support zone and explains whether it looks weak,
                medium or strong — zone behaviour, reclaim confirmation, and an opportunity score you can
                actually interpret. Educational decision support, not signals.
              </p>
              <Link
                href="/smart-support-zones"
                className="inline-flex items-center gap-2 rounded-full border border-violet-400/30 bg-violet-500/10 px-5 py-2.5 text-sm font-semibold text-violet-200 transition-all hover:bg-violet-500/20"
              >
                See the interactive preview
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
            <ZoneOverlayShowcase compact />
          </div>
        </section>

        {/* ── Feature grid ── */}
        <section className="mb-20">
          <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-white/36 mb-2">What&apos;s inside</p>
          <h2 className="text-2xl sm:text-3xl font-semibold tracking-tight text-white mb-8">One workspace, every input</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map(({ icon: Icon, label, desc }) => (
              <div key={label} className="relative overflow-hidden rounded-[24px] border border-white/10 bg-white/[0.03] p-5 backdrop-blur-xl">
                <div className="radial-backdrop" />
                <div className="relative z-10">
                  <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-full border border-violet-400/20 bg-violet-500/10 text-violet-300/80">
                    <Icon className="h-4 w-4" />
                  </div>
                  <p className="text-sm font-semibold text-white mb-1.5">{label}</p>
                  <p className="text-xs leading-relaxed text-white/46">{desc}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* ── Free vs Pro ── */}
        <section className="mb-20">
          <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-white/36 mb-2">Compare</p>
          <h2 className="text-2xl sm:text-3xl font-semibold tracking-tight text-white mb-8">Free vs Pro</h2>
          <div className="overflow-hidden rounded-[24px] border border-white/10">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/10 bg-white/[0.03]">
                  <th className="px-4 py-3 text-left font-medium text-white/60">Tool</th>
                  <th className="w-24 px-4 py-3 text-center font-medium text-white/60">Free</th>
                  <th className="w-24 px-4 py-3 text-center font-medium text-violet-300">Pro</th>
                </tr>
              </thead>
              <tbody>
                {COMPARISON.map((row) => (
                  <tr key={row.label} className="border-b border-white/[0.06] last:border-0">
                    <td className="px-4 py-3 text-white/72">{row.label}</td>
                    <td className="px-4 py-3 text-center">
                      {row.free
                        ? <Check className="mx-auto h-4 w-4 text-emerald-400/80" />
                        : <Minus className="mx-auto h-4 w-4 text-white/20" />}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <Check className="mx-auto h-4 w-4 text-violet-400" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* ── Pricing ── */}
        <section id="pricing" className="mb-20 scroll-mt-24">
          <PricingBeacon page="pro" />
          <div className="relative mx-auto max-w-lg overflow-hidden rounded-[32px] border border-violet-500/20 bg-[linear-gradient(180deg,rgba(14,12,20,0.86),rgba(8,7,12,0.9))] p-8 text-center shadow-[0_28px_72px_rgba(0,0,0,0.5)]">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(139,92,246,0.12),transparent_60%)]" />
            <div className="relative z-10">
              <div className="mb-5 inline-flex items-center rounded-full border border-violet-400/30 bg-violet-500/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-violet-300">
                Founding Member · First 100
              </div>
              <div className="mb-1 flex items-end justify-center gap-1">
                <span className="text-5xl font-bold tracking-tight text-white">€15</span>
                <span className="mb-1.5 text-white/40">/month</span>
              </div>
              <p className="mb-1 text-sm text-white/55">
                Founding price for the first 100 Pro members. Keep it for as long as you stay subscribed.
                Cancel anytime — no contracts.
              </p>
              <p className="mb-6 text-xs text-white/34">
                After the first 100 members, new members join at the standard price.
              </p>
              <CtaButton cta={cta} location="pro_pricing" size="md" />
            </div>
          </div>
        </section>

        {/* ── Trust band ── */}
        <section className="mb-20">
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="rounded-[20px] border border-white/10 bg-white/[0.03] p-5">
              <CreditCard className="mb-3 h-5 w-5 text-white/50" />
              <p className="text-sm font-medium text-white">Payments by Stripe</p>
              <p className="mt-1 text-xs text-white/45">Secure card payment. We never store your card details.</p>
            </div>
            <div className="rounded-[20px] border border-white/10 bg-white/[0.03] p-5">
              <ShieldCheck className="mb-3 h-5 w-5 text-white/50" />
              <p className="text-sm font-medium text-white">Cancel anytime</p>
              <p className="mt-1 text-xs text-white/45">Cancel from your account in one click — no emails, no retention flows.</p>
            </div>
            <div className="rounded-[20px] border border-white/10 bg-white/[0.03] p-5">
              <LineChart className="mb-3 h-5 w-5 text-white/50" />
              <p className="text-sm font-medium text-white">Analytics, not signals</p>
              <p className="mt-1 text-xs text-white/45">Educational market context and analytics. Not financial advice, not a signal service.</p>
            </div>
          </div>
        </section>

        {/* ── FAQ ── */}
        <section className="mx-auto max-w-3xl">
          <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-white/36 mb-2">FAQ</p>
          <h2 className="text-2xl sm:text-3xl font-semibold tracking-tight text-white mb-6">Common questions</h2>
          <div className="space-y-2">
            {FAQ.map(({ q, a }) => (
              <details key={q} className="group rounded-2xl border border-white/10 bg-white/[0.03] px-5 py-4">
                <summary className="flex cursor-pointer list-none items-center justify-between text-[15px] font-medium text-white">
                  {q}
                  <ChevronDown className="h-4 w-4 shrink-0 text-white/40 transition-transform group-open:rotate-180" />
                </summary>
                <p className="mt-3 text-sm leading-relaxed text-white/60">{a}</p>
              </details>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
