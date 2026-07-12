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
          "/pro",
          "/smart-support-zones",
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
          "/dashboard",
          "/dashboardv2",
          "/account",
          "/data/",
        ],
      },
    ],
    sitemap: "https://intellitrade.tech/sitemap.xml",
  };
}
