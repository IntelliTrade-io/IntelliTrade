import Link from "next/link";
import type { TagCount } from "@/lib/blog";

// Chip-link grid to the /blog/tag/<tag> listing pages. Rendered on /blog/all
// ("browse by topic") and on each tag page (sibling topics) so every tag page
// is reachable through plain crawlable links.
export function TagChips({
  tags,
  activeSlug,
  heading = "Browse by topic",
}: {
  tags: TagCount[];
  activeSlug?: string;
  heading?: string;
}) {
  if (tags.length === 0) return null;
  return (
    <nav aria-label={heading} className="mt-12 border-t border-white/10 pt-8">
      <div className="mb-4 text-center text-[11px] font-medium uppercase tracking-[0.22em] text-slate-500">
        {heading}
      </div>
      <div className="flex flex-wrap justify-center gap-2">
        {tags.map((t) =>
          t.slug === activeSlug ? (
            <span
              key={t.slug}
              aria-current="page"
              className="inline-flex items-center gap-1.5 rounded-full border border-brand bg-brand/10 px-3 py-1.5 text-[11px] font-medium uppercase tracking-[0.14em] text-brandLight/80"
            >
              {t.label}
              <span className="text-slate-500 normal-case tracking-normal">{t.count}</span>
            </span>
          ) : (
            <Link
              key={t.slug}
              href={`/blog/tag/${t.slug}`}
              className="inline-flex items-center gap-1.5 rounded-full border border-brand/25 bg-white/5 px-3 py-1.5 text-[11px] font-medium uppercase tracking-[0.14em] text-brand-300/90 transition-colors hover:border-brand/40 hover:bg-white/[0.08] hover:text-white"
            >
              {t.label}
              <span className="text-slate-500 normal-case tracking-normal">{t.count}</span>
            </Link>
          )
        )}
      </div>
    </nav>
  );
}
