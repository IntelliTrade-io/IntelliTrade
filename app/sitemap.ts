import type { MetadataRoute } from "next";
import { client } from "@/sanity/client";
import { PER_PAIR_SYMBOLS, pairToSlug } from "@/lib/pair-meta";

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

  try {
    const posts = await client.fetch<{ slug: string; publishedAt: string | null }[]>(
      `*[_type == "post" && defined(slug.current)]{ "slug": slug.current, publishedAt }`,
      {},
      { next: { revalidate: 3600 } }
    );

    blogRoutes = posts.map((post) => ({
      url: `${BASE}/blog/${post.slug}`,
      lastModified: post.publishedAt ? new Date(post.publishedAt) : undefined,
      priority: 0.7,
      changeFrequency: "monthly" as const,
    }));
  } catch {
    // Sanity unavailable — serve static routes only
  }

  return [...staticRoutes, ...blogRoutes];
}
