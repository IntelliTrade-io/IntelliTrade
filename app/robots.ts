import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: [
          "/",
          "/blog",
          "/blog/all",
          "/blog/",
          "/lotsizecalculator",
          "/lotsizecalculator/faq",
          "/gold-price-today",
          "/silver-price-today",
          "/oil-price-today",
          "/bitcoin-price-today",
          "/about",
          "/upgrade",
          "/privacyStatement",
          "/cookieStatement",
          "/termsOfService",
        ],
        disallow: [
          "/api/",
          "/auth/",
          "/protected",
          "/dashboardv2",
          "/data/",
        ],
      },
    ],
    sitemap: "https://intellitrade.tech/blog/sitemap.xml",
  };
}
