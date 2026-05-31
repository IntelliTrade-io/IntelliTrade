import Link from "next/link";
import { client } from "@/sanity/client";
import { type SanityDocument } from "next-sanity";
import {
  Calculator, CalendarDays, TrendingUp, Radar,
  ArrowRight, BookOpen, Gamepad2,
} from "lucide-react";
import { formatDate } from "@/node_modules/pliny/utils/formatDate";
import siteMetadata from "@/data/blog/siteMetadata";

const POSTS_QUERY = `*[_type == "post" && defined(slug.current)]
  | order(coalesce(publishedAt, "1970-01-01") desc)[0...3]{
    _id, title, slug, publishedAt, summary, tags
  }`;

const TOOLS = [
  {
    href: "/lotsizecalculator",
    icon: Calculator,
    label: "Lot size calculator",
    desc: "Risk-based position sizing for forex, gold and indices. Live FX conversion built in.",
    tag: "Free tool",
  },
  {
    href: "/gold-price-today",
    icon: TrendingUp,
    label: "Live prices",
    desc: "Real-time XAU/USD, XAG/USD, Brent crude and BTC/USD with charts and market context.",
    tag: "Live",
  },
  {
    href: "/dashboardv2",
    icon: CalendarDays,
    label: "Economic calendar",
    desc: "Impact-filtered macro releases with source metadata and Market Movers view.",
    tag: "Pro",
  },
  {
    href: "/dashboardv2",
    icon: Radar,
    label: "Currency strength",
    desc: "Daily and intraday strength meters across major currencies and pairs.",
    tag: "Pro",
  },
  {
    href: "/dashboardv2",
    icon: Gamepad2,
    label: "Bull vs Bear",
    desc: "Interactive bias game to test and sharpen your directional read on the market.",
    tag: "Pro",
  },
  {
    href: "/blog",
    icon: BookOpen,
    label: "Macro insights",
    desc: "Fundamental analysis and daily forex market updates written for serious traders.",
    tag: "Free",
  },
];

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
      <div className="mx-auto max-w-5xl">

        {/* Hero */}
        <section className="text-center mb-20">
          <div className="inline-flex items-center rounded-full border border-brand/30 bg-white/5 px-4 py-1 text-[11px] font-medium tracking-[0.22em] text-brand/90 mb-6">
            INTELLITRADE
          </div>
          <h1 className="text-4xl sm:text-6xl font-bold tracking-tight text-white leading-tight mb-6">
            Where smarter<br className="hidden sm:block" /> trading starts.
          </h1>
          <p className="text-base sm:text-lg text-white/50 max-w-xl mx-auto mb-10 leading-relaxed">
            Professional-grade tools and macro analysis designed to help you make disciplined, educated trading decisions.
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

        {/* Tools grid */}
        <section className="mb-20">
          <div className="mb-8">
            <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-white/36 mb-2">Platform</p>
            <h2 className="text-2xl sm:text-3xl font-semibold tracking-tight text-white">Everything in one place</h2>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {TOOLS.map(({ href, icon: Icon, label, desc, tag }) => (
              <Link
                key={label}
                href={href}
                className="group relative overflow-hidden rounded-[24px] border border-white/10 bg-white/[0.03] p-5 backdrop-blur-xl transition-all hover:border-white/20 hover:bg-white/[0.06]"
              >
                <div className="radial-backdrop" />
                <div className="relative z-10">
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/[0.05] text-white/70 group-hover:border-brand/30 group-hover:text-brand/80 transition-all">
                      <Icon className="h-4 w-4" />
                    </div>
                    <span className={`rounded-full border px-2.5 py-1 text-[10px] font-medium uppercase tracking-widest ${
                      tag === "Pro"
                        ? "border-violet-400/20 bg-violet-500/10 text-violet-300"
                        : "border-white/10 bg-white/[0.04] text-white/40"
                    }`}>
                      {tag}
                    </span>
                  </div>
                  <p className="text-sm font-semibold text-white mb-1.5">{label}</p>
                  <p className="text-xs leading-relaxed text-white/46">{desc}</p>
                  <div className="mt-4 flex items-center gap-1 text-xs text-brand/60 group-hover:text-brand/90 transition-colors">
                    Open
                    <ArrowRight className="h-3 w-3 group-hover:translate-x-0.5 transition-transform" />
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </section>

        {/* Latest insights */}
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
