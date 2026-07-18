/**
 * Post titles from the generation pipeline historically carried a fixed
 * template suffix ("… | Daily Forex Market Update | IntelliTrade") that
 * pattern-matches Google's scaled/templated-content signal (see
 * GOOGLE_ADSENSE_APPROVAL.md §1). Strip known template segments from the
 * end of a title at render time so every surface (metadata, h1, OG,
 * JSON-LD, listings) shows only the unique headline — including future
 * posts, until the pipeline itself stops emitting the suffix.
 */
const TEMPLATE_SEGMENTS = /^(?:daily forex market update|week ahead forex market outlook|intellitrade)$/i;

export function cleanPostTitle(rawTitle: string | null | undefined): string {
  const title = (rawTitle ?? "").trim();
  if (!title.includes("|")) return title;

  const parts = title.split("|").map((part) => part.trim());
  while (parts.length > 1 && TEMPLATE_SEGMENTS.test(parts[parts.length - 1] ?? "")) {
    parts.pop();
  }
  return parts.filter(Boolean).join(" | ");
}

/**
 * URL slug for a Sanity post tag. Tags are stored as plain English strings
 * ("EUR/USD outlook", "forex market update"), so tag pages address them by a
 * normalized slug and match posts by comparing slugified values — spacing,
 * case or punctuation variants of the same tag land on the same page.
 */
export function slugifyTag(tag: string): string {
  return tag
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export interface TagCount {
  /** Display text, verbatim from Sanity (first spelling seen wins). */
  label: string;
  /** URL slug from slugifyTag. */
  slug: string;
  count: number;
}

/** Aggregate tag lists into unique tags (deduped by slug), most-used first. */
export function collectTagCounts(tagLists: string[][]): TagCount[] {
  const bySlug = new Map<string, TagCount>();
  for (const tags of tagLists) {
    for (const tag of tags) {
      const slug = slugifyTag(tag);
      if (!slug) continue;
      const existing = bySlug.get(slug);
      if (existing) existing.count += 1;
      else bySlug.set(slug, { label: tag, slug, count: 1 });
    }
  }
  return Array.from(bySlug.values()).sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}

type PortableTextChild = { text?: string };
type PortableTextBlock = { _type?: string; children?: PortableTextChild[] };

/**
 * Plain-text excerpt from a Portable Text body, cut at a word boundary.
 * Used as the meta-description fallback: no post currently has a summary,
 * and a per-post excerpt beats one identical fallback sentence on 180+ pages.
 */
export function excerptFromPortableText(
  body: unknown,
  maxLength = 160
): string {
  if (!Array.isArray(body)) return "";

  let text = "";
  for (const block of body as PortableTextBlock[]) {
    if (block._type !== "block" || !Array.isArray(block.children)) continue;
    const blockText = block.children
      .map((child) => child.text ?? "")
      .join("")
      .trim();
    if (!blockText) continue;
    text += (text ? " " : "") + blockText;
    if (text.length >= maxLength) break;
  }

  if (text.length <= maxLength) return text;
  const cut = text.slice(0, maxLength);
  const lastSpace = cut.lastIndexOf(" ");
  return `${cut.slice(0, lastSpace > 0 ? lastSpace : maxLength).replace(/[,;:.\s]+$/, "")}…`;
}
