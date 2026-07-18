// Related free tools block for blog posts (internal-linking pass: the blog
// rarely linked to the calculators, which are the site's proven free-traffic
// engine). Pure server component — pair detection runs on the post's tags, so
// a "EUR/USD outlook" post links straight to the EUR/USD calculator pages.

import Link from "next/link";
import { PER_PAIR_SYMBOLS, pairToSlug } from "@/lib/pair-meta";

// Common asset words in tags that map to a calculator pair page.
const TAG_ALIASES: Record<string, string> = {
  GOLD: "XAUUSD",
  SILVER: "XAGUSD",
  BITCOIN: "BTCUSD",
  ETHEREUM: "ETHUSD",
};

/** First tag that names a supported instrument ("EUR/USD outlook" → EURUSD). */
function pairFromTags(tags: string[]): string | null {
  for (const tag of tags) {
    const upper = tag.toUpperCase();
    const m = upper.match(/\b([A-Z]{3})\s*\/?\s*([A-Z]{3})\b/);
    if (m) {
      const candidate = `${m[1]}${m[2]}`;
      if (PER_PAIR_SYMBOLS.includes(candidate)) return candidate;
    }
    for (const [word, pair] of Object.entries(TAG_ALIASES)) {
      if (upper.includes(word) && PER_PAIR_SYMBOLS.includes(pair)) return pair;
    }
  }
  return null;
}

export function RelatedTools({ tags }: { tags: string[] }) {
  const pair = pairFromTags(tags);
  const slug = pair ? pairToSlug(pair) : null;
  const display = pair ? `${pair.slice(0, 3)}/${pair.slice(3)}` : null;

  const tools = [
    {
      href: slug ? `/lotsizecalculator/${slug}` : "/lotsizecalculator",
      label: display ? `${display} lot size calculator` : "Lot size calculator",
    },
    {
      href: slug ? `/pipvaluecalculator/${slug}` : "/pipvaluecalculator",
      label: display ? `${display} pip value calculator` : "Pip value calculator",
    },
    {
      href: slug ? `/margincalculator/${slug}` : "/margincalculator",
      label: display ? `${display} margin calculator` : "Margin calculator",
    },
    { href: "/economic-calendar", label: "Economic calendar" },
    { href: "/forex-market-hours", label: "Forex market hours" },
    { href: "/compoundingcalculator", label: "Compounding calculator" },
  ];

  return (
    <aside aria-label="Free trading tools" className="mt-12 border-t border-white/10 pt-8 text-left">
      <p className="text-[11px] font-semibold uppercase tracking-[0.25em] text-brand/90">Free tools</p>
      <p className="mt-2 text-sm text-slate-400">
        Put the analysis in context with IntelliTrade&apos;s free calculators.
      </p>
      <div className="mt-4 flex flex-wrap gap-2.5">
        {tools.map((tool) => (
          <Link
            key={tool.href}
            href={tool.href}
            className="inline-flex items-center rounded-full border border-white/15 bg-white/5 px-4 py-2 text-[13px] text-slate-200 transition-colors hover:border-brand/40 hover:text-white"
          >
            {tool.label}
          </Link>
        ))}
      </div>
    </aside>
  );
}
