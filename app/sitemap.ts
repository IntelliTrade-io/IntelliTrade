import type { MetadataRoute } from "next";
import { client } from "@/sanity/client";
import { slugifyTag } from "@/lib/blog";
import { PER_PAIR_SYMBOLS, pairToSlug } from "@/lib/pair-meta";
import { STRENGTH_PAIR_SYMBOLS, strengthPairToSlug } from "@/lib/strength-pairs";
import {
  getPublishedMonths,
  getPublishedSlugs,
  isCsmReviewsEnabled,
} from "@/lib/api/csmReviews";

const BASE = "https://intellitrade.tech";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const staticRoutes: MetadataRoute.Sitemap = [
    { url: `${BASE}/`, priority: 1.0, changeFrequency: "weekly" },
    { url: `${BASE}/blog`, priority: 0.9, changeFrequency: "daily" },
    { url: `${BASE}/blog/all`, priority: 0.8, changeFrequency: "daily" },
    { url: `${BASE}/pro`, priority: 0.9, changeFrequency: "weekly" },
    { url: `${BASE}/smart-support-zones`, priority: 0.9, changeFrequency: "weekly" },
    { url: `${BASE}/lotsizecalculator`, priority: 0.9, changeFrequency: "monthly" },
    { url: `${BASE}/lotsizecalculator/faq`, priority: 0.7, changeFrequency: "monthly" },
    // Per-pair calculator SEO pages (e.g. /lotsizecalculator/eurusd)
    ...PER_PAIR_SYMBOLS.map((symbol) => ({
      url: `${BASE}/lotsizecalculator/${pairToSlug(symbol)}`,
      priority: 0.6,
      changeFrequency: "monthly" as const,
    })),
    { url: `${BASE}/pipvaluecalculator`, priority: 0.8, changeFrequency: "monthly" },
    // Per-pair pip value SEO pages (e.g. /pipvaluecalculator/eurusd)
    ...PER_PAIR_SYMBOLS.map((symbol) => ({
      url: `${BASE}/pipvaluecalculator/${pairToSlug(symbol)}`,
      priority: 0.6,
      changeFrequency: "monthly" as const,
    })),
    { url: `${BASE}/margincalculator`, priority: 0.8, changeFrequency: "monthly" },
    // Per-pair margin SEO pages (e.g. /margincalculator/eurusd)
    ...PER_PAIR_SYMBOLS.map((symbol) => ({
      url: `${BASE}/margincalculator/${pairToSlug(symbol)}`,
      priority: 0.6,
      changeFrequency: "monthly" as const,
    })),
    { url: `${BASE}/compoundingcalculator`, priority: 0.8, changeFrequency: "monthly" },
    { url: `${BASE}/economic-calendar`, priority: 0.8, changeFrequency: "daily" },
    { url: `${BASE}/currency-strength`, priority: 0.8, changeFrequency: "daily" },
    // Per-pair strength SEO pages (e.g. /currency-strength/eurusd)
    ...STRENGTH_PAIR_SYMBOLS.map((symbol) => ({
      url: `${BASE}/currency-strength/${strengthPairToSlug(symbol)}`,
      priority: 0.6,
      changeFrequency: "daily" as const,
    })),
    { url: `${BASE}/forex-market-hours`, priority: 0.8, changeFrequency: "monthly" },
    { url: `${BASE}/gold-price-today`, priority: 0.8, changeFrequency: "daily" },
    { url: `${BASE}/silver-price-today`, priority: 0.8, changeFrequency: "daily" },
    { url: `${BASE}/oil-price-today`, priority: 0.8, changeFrequency: "daily" },
    { url: `${BASE}/bitcoin-price-today`, priority: 0.8, changeFrequency: "daily" },
    { url: `${BASE}/about`, priority: 0.6, changeFrequency: "monthly" },
    { url: `${BASE}/upgrade`, priority: 0.5, changeFrequency: "monthly" },
    { url: `${BASE}/privacyStatement`, priority: 0.3, changeFrequency: "yearly" },
    { url: `${BASE}/cookieStatement`, priority: 0.3, changeFrequency: "yearly" },
    { url: `${BASE}/termsOfService`, priority: 0.3, changeFrequency: "yearly" },
  ];

  let blogRoutes: MetadataRoute.Sitemap = [];
  let tagRoutes: MetadataRoute.Sitemap = [];

  try {
    const posts = await client.fetch<{ slug: string; publishedAt: string | null; tags?: string[] }[]>(
      `*[_type == "post" && defined(slug.current)]{ "slug": slug.current, publishedAt, tags }`,
      {},
      { next: { revalidate: 3600 } }
    );

    blogRoutes = posts.map((post) => ({
      url: `${BASE}/blog/${post.slug}`,
      lastModified: post.publishedAt ? new Date(post.publishedAt) : undefined,
      priority: 0.7,
      changeFrequency: "monthly" as const,
    }));

    // One /blog/tag/<slug> route per unique tag (previously only in the nested
    // /blog/sitemap.xml, which robots never referenced — this sitemap is now
    // the single owner of every blog URL).
    const tagSlugs = new Set<string>();
    for (const post of posts) {
      for (const tag of post.tags ?? []) {
        const slug = slugifyTag(tag);
        if (slug) tagSlugs.add(slug);
      }
    }
    tagRoutes = Array.from(tagSlugs).map((slug) => ({
      url: `${BASE}/blog/tag/${slug}`,
      priority: 0.5,
      changeFrequency: "weekly" as const,
    }));
  } catch {
    // Sanity unavailable — serve static routes only
  }

  // CSM public reviews — flag-gated. Zero entries when the feature is in shadow.
  let reviewRoutes: MetadataRoute.Sitemap = [];
  if (isCsmReviewsEnabled()) {
    try {
      const [slugs, months] = await Promise.all([getPublishedSlugs(), getPublishedMonths()]);
      if (slugs.length > 0) {
        reviewRoutes = [
          { url: `${BASE}/currency-strength/reviews`, priority: 0.7, changeFrequency: "daily" },
          { url: `${BASE}/currency-strength/reviews/methodology`, priority: 0.5, changeFrequency: "monthly" },
          { url: `${BASE}/currency-strength/reviews/scorecard`, priority: 0.6, changeFrequency: "weekly" },
          ...slugs.map((s) => ({
            url: `${BASE}/currency-strength/reviews/${s.slug}`,
            lastModified: s.updatedAt ? new Date(s.updatedAt) : undefined,
            priority: 0.6,
            changeFrequency: "monthly" as const,
          })),
          ...months.map((m) => {
            const [year, month] = m.split("-");
            return {
              url: `${BASE}/currency-strength/reviews/monthly/${year}/${month}`,
              priority: 0.5,
              changeFrequency: "monthly" as const,
            };
          }),
        ];
      }
    } catch {
      // Review tables unavailable — omit review routes.
    }
  }

  return [...staticRoutes, ...blogRoutes, ...tagRoutes, ...reviewRoutes];
}
