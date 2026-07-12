import type { Metadata } from "next";
import { jsonLd } from "@/lib/jsonLd";
import GoldPriceTodayPage from "./_components/GoldPriceTodayPage";

export const metadata: Metadata = {
  title: "Gold Price Today (XAU/USD) · IntelliTrade",
  description:
    "Live gold price in USD. Real-time XAU/USD quote, daily chart, market context, and key market relationships — updated throughout the session.",
  alternates: { canonical: "https://intellitrade.tech/gold-price-today" },
  openGraph: {
    title: "Gold Price Today (XAU/USD) · IntelliTrade",
    description:
      "Live gold price in USD. Real-time XAU/USD quote, daily chart, market context, and key market relationships.",
    url: "https://intellitrade.tech/gold-price-today",
    siteName: "IntelliTrade",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Gold Price Today (XAU/USD) · IntelliTrade",
    description: "Live gold price in USD with daily chart and market context.",
  },
};

const schema = {
  "@context": "https://schema.org",
  "@type": "WebPage",
  name: "Gold Price Today (XAU/USD)",
  description:
    "Live gold price in USD. Real-time XAU/USD quote, daily chart, market context, and key market relationships.",
  url: "https://intellitrade.tech/gold-price-today",
  publisher: { "@type": "Organization", name: "IntelliTrade", url: "https://intellitrade.tech" },
  breadcrumb: {
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: "https://intellitrade.tech/" },
      { "@type": "ListItem", position: 2, name: "Gold Price Today", item: "https://intellitrade.tech/gold-price-today" },
    ],
  },
};

export default function Page() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLd(schema) }}
      />
      <GoldPriceTodayPage />
    </>
  );
}
