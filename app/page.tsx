import type { Metadata } from "next";
import Link from "next/link";
import { client } from "@/sanity/client";
import { type SanityDocument } from "next-sanity";
import {
  Calculator, TrendingUp, BookOpen,
  CalendarDays, Radar, Gamepad2,
  ArrowRight, Lock,
} from "lucide-react";
import { formatDate } from "@/lib/formatDate";
import siteMetadata from "@/data/blog/siteMetadata";

export const metadata: Metadata = {
  title: "IntelliTrade — Where Smarter Trading Starts",
  description:
    "Professional-grade trading tools, macro analysis and market context for disciplined traders. Free lot size calculator, live asset prices, and weekly macro insights.",
  alternates: { canonical: "https://intellitrade.tech/" },
  openGraph: {
    title: "IntelliTrade — Where Smarter Trading Starts",
    description:
      "Professional-grade trading tools, macro analysis and market context for disciplined traders.",
    url: "https://intellitrade.tech/",
    siteName: "IntelliTrade",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "IntelliTrade — Where Smarter Trading Starts",
    description:
      "Professional-grade trading tools, macro analysis and market context for disciplined traders.",
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
    _id, title, slug, publishedAt, summary, tags
  }`;

// ─── Tool cards ───────────────────────────────────────────────────────────────

const FREE_TOOLS = [
  {
    href: "/lotsizecalculator",
    icon: Calculator,
    label: "Lot Size Calculator",
    desc: "Stop guessing your position size. Manage risk like a professional with a clean calculator built for forex, gold, indices and crypto.",
    tag: "FREE TOOL",
    cta: "Open",
    isPro: false,
  },
  {
    href: "/gold-price-today",
    icon: TrendingUp,
    label: "Prices Today",
    desc: "Track current prices for Gold, Silver, Oil and Bitcoin, with clear context on what is driving each market.",
    tag: "FREE",
    cta: "Open",
    isPro: false,
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

const PRO_TOOLS = [
  {
    href: "/dashboardv2",
    icon: CalendarDays,
    label: "Economic Calendar",
    desc: "Avoid unpleasant surprises. Plan ahead with a clean view of the economic events that can move markets.",
    tag: "PRO",
    cta: "Open",
    isPro: true,
  },
  {
    href: "/dashboardv2",
    icon: Radar,
    label: "Currency Strength Meter",
    desc: "Don't trade noise. Quickly spot which currencies are strong or weak across daily and intraday trends.",
    tag: "PRO",
    cta: "Open",
    isPro: true,
  },
  {
    href: "/dashboardv2",
    icon: Gamepad2,
    label: "Bull vs Bear",
    desc: "A fast-paced trading minigame for the moments between setups. Simple, addictive and exclusive to IntelliTrade members.",
    tag: "PRO",
    cta: "Play",
    isPro: true,
  },
];

// ─── Components ───────────────────────────────────────────────────────────────

function ToolCard({ tool }: { tool: typeof FREE_TOOLS[number] & { meta?: string } }) {
  const isPro = tool.isPro;
  return (
    <Link
      href={tool.href}
      className="group relative overflow-hidden rounded-[24px] border border-white/10 bg-white/[0.03] p-5 backdrop-blur-xl transition-all hover:border-white/20 hover:bg-white/[0.06]"
    >
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

        <div className={`mt-4 flex items-center gap-1 text-xs transition-colors ${
          isPro ? "text-violet-400/60 group-hover:text-violet-300" : "text-brand/60 group-hover:text-brand/90"
        }`}>
          {tool.cta}
          <ArrowRight className="h-3 w-3 group-hover:translate-x-0.5 transition-transform" />
        </div>
      </div>
    </Link>
  );
}

function ComingSoonCard() {
  return (
    <div className="relative overflow-hidden rounded-[24px] border border-violet-500/20 bg-violet-500/[0.04] p-5">
      {/* Purple glow */}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(139,92,246,0.12),transparent_60%)]" />
      {/* Blurred mock content */}
      <div className="relative z-10 blur-[3px] select-none pointer-events-none">
        <div className="flex items-start justify-between mb-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-full border border-violet-400/20 bg-violet-500/10">
            <Lock className="h-4 w-4 text-violet-300/60" />
          </div>
          <span className="rounded-full border border-violet-400/20 bg-violet-500/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-widest text-violet-300">
            PRO
          </span>
        </div>
        <div className="h-3 w-24 rounded-full bg-white/10 mb-2" />
        <div className="space-y-1.5">
          <div className="h-2 w-full rounded-full bg-white/[0.06]" />
          <div className="h-2 w-4/5 rounded-full bg-white/[0.06]" />
          <div className="h-2 w-3/5 rounded-full bg-white/[0.06]" />
        </div>
      </div>
      {/* Coming Soon overlay */}
      <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-2">
        <span className="rounded-full border border-violet-400/30 bg-violet-500/20 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-violet-200">
          PRO
        </span>
        <span className="text-sm font-semibold text-violet-100/80">Coming Soon</span>
      </div>
    </div>
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
      title: p.title ?? "",
      summary: p.summary ?? "",
      tags: p.tags ?? [],
    }));
  } catch {
    // blog posts optional on landing
  }

  return (
    <div className="w-full px-4 pb-24 pt-16 sm:px-6">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationSchema) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(webSiteSchema) }}
      />
      <div className="mx-auto max-w-5xl">

        {/* ── Hero ── */}
        <section className="text-center mb-20">
          <div className="inline-flex items-center rounded-full border border-brand/30 bg-white/5 px-4 py-1 text-[11px] font-medium tracking-[0.22em] text-brand/90 mb-6">
            INTELLITRADE
          </div>
          <h1 className="text-4xl sm:text-6xl font-bold tracking-tight text-white leading-tight mb-6">
            Where smarter<br className="hidden sm:block" /> trading starts.
          </h1>
          <p className="text-base sm:text-lg text-white/50 max-w-xl mx-auto mb-10 leading-relaxed">
            Professional-grade trading tools, macro analysis and market context to help you make disciplined, informed decisions.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <Link
              href="/lotsizecalculator"
              className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-brand to-brandLight px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-brand/35 transition-all hover:opacity-90"
            >
              Try the calculator
              <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              href="/blog"
              className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/5 px-6 py-3 text-sm font-medium text-white transition-all hover:bg-white/10"
            >
              Read insights
            </Link>
          </div>
        </section>

        {/* ── Platform ── */}
        <section className="mb-20">
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
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 mb-4">
            {PRO_TOOLS.map((tool) => <ToolCard key={tool.label} tool={tool} />)}
          </div>

          {/* Coming Soon row */}
          <p className="text-[11px] text-white/28 text-center mb-4 uppercase tracking-[0.2em]">
            More Pro tools are being built for the IntelliTrade workspace
          </p>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <ComingSoonCard />
            <ComingSoonCard />
            <ComingSoonCard />
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
