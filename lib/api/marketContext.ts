// Server-side fetcher for the Sanity `marketContext` documents that the
// cofounder posts per asset (gold/silver/oil/bitcoin). Fetched in the price
// pages' server components so the editorial text is in the crawled HTML —
// it used to be fetched client-side in a useEffect, which kept the pages'
// only editorial content out of reliable search-engine view.
//
// All fields beyond heading/paragraphs are optional: the Studio schema may
// not have them yet (snippet in SANITY_SCHEMA_UPGRADE.md), and older docs
// never will. Callers render each section only when present.

import { client } from "@/sanity/client";

export type MarketContextStat = { label: string; value: string };
export type MarketContextLink = { label: string; href: string };

export type MarketContext = {
  heading: string | null;
  date: string | null;
  paragraphs: { text: string }[] | null;
  weekRecap: string | null;
  stats: MarketContextStat[] | null;
  relatedLinks: MarketContextLink[] | null;
};

export type MarketContextAsset = "gold" | "silver" | "oil" | "bitcoin";

export async function fetchMarketContext(
  asset: MarketContextAsset
): Promise<MarketContext | null> {
  try {
    const data = await client.fetch<MarketContext | null>(
      `*[_type == "marketContext" && asset == $asset] | order(date desc)[0] {
        heading,
        date,
        paragraphs,
        weekRecap,
        stats,
        relatedLinks
      }`,
      { asset },
      { next: { revalidate: 300 } }
    );
    return data ?? null;
  } catch {
    return null;
  }
}
