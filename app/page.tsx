import type { Metadata } from "next";
import type { LucideIcon } from "lucide-react";
import { jsonLd } from "@/lib/jsonLd";
import Link from "next/link";
import { client } from "@/sanity/client";
import { type SanityDocument } from "next-sanity";
import {
  Calculator, TrendingUp, BookOpen,
  CalendarDays, Radar, Gamepad2,
  ArrowRight, LineChart,
} from "lucide-react";
import { formatDate } from "@/lib/formatDate";
import { cleanPostTitle, excerptFromPortableText } from "@/lib/blog";
import siteMetadata from "@/data/blog/siteMetadata";
import { TrackedLink } from "@/components/layout/TrackedLink";
import { ZoneOverlayShowcase } from "@/components/support-resistance/ZoneOverlayShowcase";

export const metadata: Metadata = {
  title: "IntelliTrade: Stop Trading Blind. Start With Context.",
  description:
    "Your pre-trade routine in one workspace: support-zone quality, currency strength, event risk and position sizing. Free lot size calculator, live asset prices, and macro insights.",
  alternates: { canonical: "https://intellitrade.tech/" },
  openGraph: {
    title: "IntelliTrade: Stop Trading Blind. Start With Context.",
    description:
      "Your pre-trade routine in one workspace: support-zone quality, currency strength, event risk and position sizing.",
    url: "https://intellitrade.tech/",
    siteName: "IntelliTrade",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "IntelliTrade: Stop Trading Blind. Start With Context.",
    description:
      "Your pre-trade routine in one workspace: support-zone quality, currency strength, event risk and position sizing.",
  },
};

const organizationSchema = {
  "@context": "https://schema.org",
  "@type": "Organization",
  name: "IntelliTrade",
  url: "https://intellitrade.tech",
  description:
    "IntelliTrade is a macro-first trading analysis platform offering educational market commentary, trading tools, and risk-management utilities for traders.",
  sameAs: [],
};

const webSiteSchema = {
  "@context": "https://schema.org",
  "@type": "WebSite",
  name: "IntelliTrade",
  url: "https://intellitrade.tech",
  description:
    "Professional-grade trading tools, macro analysis and market context for disciplined traders.",
  publisher: { "@type": "Organization", name: "IntelliTrade", url: "https://intellitrade.tech" },
};

const POSTS_QUERY = `*[_type == "post" && defined(slug.current)]
  | order(coalesce(publishedAt, "1970-01-01") desc)[0...3]{
    _id, title, slug, publishedAt, summary, tags, body
  }`;

// ─── Tool cards ───────────────────────────────────────────────────────────────

type ToolCardData = {
  href: string;
  icon: LucideIcon;
  label: string;
  desc: string;
  tag: string;
  cta: string;
  isPro: boolean;
  meta?: string;
  subLinks?: { label: string; href: string }[];
};

const FREE_TOOLS: ToolCardData[] = [
  {
    href: "/lotsizecalculator",
    icon: Calculator,
    label: "Calculators",
    desc: "Free risk tools for forex, gold and crypto: size your position to your risk, and find pip value in your account currency, with live rates.",
    tag: "FREE",
    cta: "Open",
    isPro: false,
    subLinks: [
      { label: "Lot size", href: "/lotsizecalculator" },
      { label: "Pip value", href: "/pipvaluecalculator" },
    ],
  },
  {
    href: "/gold-price-today",
    icon: TrendingUp,
    label: "Prices Today",
    desc: "Track current prices for Gold, Silver, Oil and Bitcoin, with clear context on what is driving each market.",
    tag: "FREE",
    cta: "Open",
    isPro: false,
    subLinks: [
      { label: "Gold", href: "/gold-price-today" },
      { label: "Silver", href: "/silver-price-today" },
      { label: "Oil", href: "/oil-price-today" },
      { label: "Bitcoin", href: "/bitcoin-price-today" },
    ],
  },
  {
    href: "/blog",
    icon: BookOpen,
    label: "Macro Insights",
    desc: "Don't trade blind. Stay informed with fundamental market analysis and forex updates written for serious traders.",
    tag: "FREE",
    cta: "Read",
    isPro: false,
    meta: "Updated 6× weekly",
  },
];

const PRO_TOOLS: ToolCardData[] = [
  {
    href: "/smart-support-zones",
    icon: LineChart,
    label: "Smart Support Zones",
    desc: "Most tools draw zones. IntelliTrade scores them (weak, medium or strong) for EURUSD, with reclaim confirmation and an explained opportunity score.",
    tag: "PRO",
    cta: "Preview",
    isPro: true,
  },
  {
    href: "/pro",
    icon: CalendarDays,
    label: "Economic Calendar",
    desc: "Avoid unpleasant surprises. Plan ahead with a clean view of the economic events that can move markets.",
    tag: "PRO",
    cta: "Open",
    isPro: true,
  },
  {
    href: "/pro",
    icon: Radar,
    label: "Currency Strength Meter",
    desc: "Don't trade noise. Quickly spot which currencies are strong or weak across daily and intraday trends.",
    tag: "PRO",
    cta: "Open",
    isPro: true,
  },
  {
    href: "/pro",
    icon: Gamepad2,
    label: "Bull vs Bear",
    desc: "A fast-paced trading minigame for the moments between setups. Simple, addictive and exclusive to IntelliTrade members.",
    tag: "PRO",
    cta: "Play",
    isPro: true,
  },
];

// ─── Components ───────────────────────────────────────────────────────────────

function ToolCard({ tool }: { tool: ToolCardData }) {
  const isPro = tool.isPro;

  const cardBody = (
    <>
      <div className="radial-backdrop" />
      <div className="relative z-10 flex flex-col h-full">
        <div className="flex items-start justify-between mb-4">
          <div className={`flex h-10 w-10 items-center justify-center rounded-full border transition-all ${
            isPro
              ? "border-violet-400/20 bg-violet-500/10 text-violet-300/80 group-hover:border-violet-400/40 group-hover:text-violet-200"
              : "border-white/10 bg-white/[0.05] text-white/70 group-hover:border-brand/30 group-hover:text-brand/80"
          }`}>
            <tool.icon className="h-4 w-4" />
          </div>
          <span className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-widest ${
            isPro
              ? "border-violet-400/20 bg-violet-500/10 text-violet-300"
              : "border-white/10 bg-white/[0.04] text-white/40"
          }`}>
            {tool.tag}
          </span>
        </div>

        <p className="text-sm font-semibold text-white mb-1.5">{tool.label}</p>
        <p className="text-xs leading-relaxed text-white/46 flex-1">{tool.desc}</p>

        {tool.meta && (
          <span className="mt-2 inline-flex text-[10px] text-white/28 uppercase tracking-wider">{tool.meta}</span>
        )}

        {tool.subLinks ? (
          // Per-asset entry points. Rendered as sibling links (the wrapper is a
          // div, not a Link) so we don't nest anchors.
          <div className="mt-4 flex flex-wrap gap-2">
            {tool.subLinks.map((sub) => (
              <Link
                key={sub.href}
                href={sub.href}
                className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs text-white/70 transition-all hover:border-brand/30 hover:bg-white/[0.07] hover:text-white"
              >
                {sub.label}
              </Link>
            ))}
          </div>
        ) : (
          <div className={`mt-4 flex items-center gap-1 text-xs transition-colors ${
            isPro ? "text-violet-400/60 group-hover:text-violet-300" : "text-brand/60 group-hover:text-brand/90"
          }`}>
            {tool.cta}
            <ArrowRight className="h-3 w-3 group-hover:translate-x-0.5 transition-transform" />
          </div>
        )}
      </div>
    </>
  );

  const cardClass =
    "group relative overflow-hidden rounded-[24px] border border-white/10 bg-white/[0.03] p-5 backdrop-blur-xl transition-all hover:border-white/20 hover:bg-white/[0.06]";

  // Cards with per-asset sub-links can't be a single anchor (no nested links),
  // so they render as a div; the sub-links carry navigation instead.
  if (tool.subLinks) {
    return <div className={cardClass}>{cardBody}</div>;
  }

  return (
    <Link href={tool.href} className={cardClass}>
      {cardBody}
    </Link>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function HomePage() {
  let posts: { slug: string; date: string; title: string; summary: string; tags: string[] }[] = [];

  try {
    const raw: SanityDocument[] = await client.fetch(POSTS_QUERY, {}, { next: { revalidate: 60 } });
    posts = raw.map((p) => ({
      slug: p.slug?.current ?? "",
      date: p.publishedAt ?? new Date().toISOString(),
      title: cleanPostTitle(p.title),
      summary: p.summary || excerptFromPortableText(p.body),
      tags: p.tags ?? [],
    }));
  } catch {
    // blog posts optional on landing
  }

  return (
    <div className="w-full px-4 pb-24 pt-16 sm:px-6">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLd(organizationSchema) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLd(webSiteSchema) }}
      />
      <div className="mx-auto max-w-5xl">

        {/* ── Hero ── */}
        <section className="text-center mb-20">
          <h1 className="text-4xl sm:text-6xl font-bold tracking-tight text-white leading-tight mb-6">
            Stop trading blind.<br className="hidden sm:block" /> Start with context.
          </h1>
          <p className="text-base sm:text-lg text-white/50 max-w-xl mx-auto mb-10 leading-relaxed">
            IntelliTrade is your pre-trade routine: support-zone quality, currency strength, event risk and position sizing, checked in minutes, before you consider a trade.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <TrackedLink
              href="/pro"
              event="cta_click"
              params={{ cta_id: "home_hero_pro", destination: "/pro" }}
              className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-brand to-brandLight px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-brand/35 transition-all hover:opacity-90"
            >
              Explore IntelliTrade Pro
              <ArrowRight className="h-4 w-4" />
            </TrackedLink>
            <Link
              href="/lotsizecalculator"
              className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/5 px-6 py-3 text-sm font-medium text-white transition-all hover:bg-white/10"
            >
              Try the free calculator
            </Link>
          </div>
        </section>

        {/* ── Spotlight: Smart Support Zones ── */}
        <section className="mb-20">
          <div className="relative overflow-hidden rounded-[28px] border border-white/10 bg-white/[0.03] p-4 backdrop-blur-xl sm:p-6">
            <div className="radial-backdrop" />
            <div className="relative z-10">
              <div className="mb-6 grid gap-6 lg:grid-cols-2 lg:items-center">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-violet-300/80 mb-3">
                    IntelliTrade Pro · Smart Support Zones
                  </p>
                  <h2 className="text-2xl sm:text-4xl font-semibold tracking-tight text-white leading-tight">
                    Most tools draw zones. IntelliTrade scores them.
                  </h2>
                </div>
                <div>
                  <p className="text-sm sm:text-base text-white/50 leading-relaxed mb-4">
                    Smart Support Zones evaluates every EURUSD support zone and explains whether it looks weak,
                    medium or strong: zone behaviour, reclaim confirmation, and an opportunity score you can
                    actually interpret. Educational decision support, not signals.
                  </p>
                  <TrackedLink
                    href="/smart-support-zones"
                    event="cta_click"
                    params={{ cta_id: "home_ssz_section", destination: "/smart-support-zones" }}
                    className="group inline-flex items-center gap-2 text-sm font-semibold text-violet-300/70 transition-colors hover:text-violet-200"
                  >
                    See how zone scoring works
                    <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                  </TrackedLink>
                </div>
              </div>
              <ZoneOverlayShowcase compact />
            </div>
          </div>
        </section>

        {/* ── Platform ── */}
        <section className="mb-16">
          <div className="mb-8">
            <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-white/36 mb-2">Platform</p>
            <h2 className="text-2xl sm:text-3xl font-semibold tracking-tight text-white mb-2">Everything in one place</h2>
            <p className="text-sm text-white/40 max-w-lg">
              Professional market analysis, done in minutes and brought together in one clean workspace.
            </p>
          </div>

          {/* Free tools row */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 mb-4">
            {FREE_TOOLS.map((tool) => <ToolCard key={tool.label} tool={tool} />)}
          </div>

          {/* Pro tools row */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {PRO_TOOLS.map((tool) => <ToolCard key={tool.label} tool={tool} />)}
          </div>
        </section>

        {/* ── Founding Member strip ── */}
        <section className="mb-20">
          <div className="relative overflow-hidden rounded-[28px] border border-violet-500/20 bg-violet-500/[0.05] p-6 sm:p-8">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_80%_10%,rgba(139,92,246,0.14),transparent_55%)]" />
            <div className="relative z-10 flex flex-col items-start justify-between gap-5 sm:flex-row sm:items-center">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-violet-300 mb-2">
                  Founding Member · First 100
                </p>
                <p className="text-lg sm:text-xl font-semibold text-white">
                  €15/month for the first 100 members.
                </p>
                <p className="mt-1 text-sm text-white/55">
                  Keep the price for as long as you stay subscribed. Cancel anytime, no contracts.
                </p>
              </div>
              <TrackedLink
                href="/pro#pricing"
                event="founding_cta_click"
                params={{ location: "home_strip" }}
                className="inline-flex shrink-0 items-center gap-2 rounded-full bg-violet-600 px-6 py-3 text-sm font-semibold text-white shadow-[0_0_32px_rgba(139,92,246,0.35)] transition-all hover:bg-violet-500"
              >
                Become a Founding Member
                <ArrowRight className="h-4 w-4" />
              </TrackedLink>
            </div>
          </div>
        </section>

        {/* ── Latest insights ── */}
        {posts.length > 0 && (
          <section>
            <div className="flex items-end justify-between mb-8">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-white/36 mb-2">Blog</p>
                <h2 className="text-2xl sm:text-3xl font-semibold tracking-tight text-white">Latest insights</h2>
              </div>
              <Link
                href="/blog/all"
                className="inline-flex items-center gap-1.5 text-sm text-brand/70 hover:text-brand transition-colors"
              >
                View all
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {posts.map((post) => (
                <Link
                  key={post.slug}
                  href={`/blog/${post.slug}`}
                  className="group relative overflow-hidden rounded-[24px] border border-white/10 bg-white/[0.03] p-5 backdrop-blur-xl transition-all hover:border-brand/30 hover:bg-white/[0.06]"
                >
                  <div className="radial-backdrop" />
                  <div className="relative z-10 flex flex-col h-full">
                    <time className="text-[11px] text-white/36 mb-3">
                      {formatDate(post.date, siteMetadata.locale)}
                    </time>
                    <h3 className="text-sm font-semibold text-white leading-snug mb-2 group-hover:text-brand/90 transition-colors line-clamp-2">
                      {post.title}
                    </h3>
                    <p className="text-xs leading-relaxed text-white/46 line-clamp-3 flex-1">
                      {post.summary}
                    </p>
                    <div className="mt-4 flex items-center gap-1 text-xs text-brand/60 group-hover:text-brand/90 transition-colors">
                      Read
                      <ArrowRight className="h-3 w-3 group-hover:translate-x-0.5 transition-transform" />
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </section>
        )}

      </div>
    </div>
  );
}
