import type { Metadata } from "next";
import { jsonLd } from "@/lib/jsonLd";
import SilverPriceTodayPage from "./_components/SilverPriceTodayPage";

export const metadata: Metadata = {
  title: "Silver Price Today (XAG/USD) · IntelliTrade",
  description:
    "Live silver price in USD. Real-time XAG/USD quote, daily chart, market context, and key market relationships — updated throughout the session.",
  alternates: { canonical: "https://intellitrade.tech/silver-price-today" },
  openGraph: {
    title: "Silver Price Today (XAG/USD) · IntelliTrade",
    description:
      "Live silver price in USD. Real-time XAG/USD quote, daily chart, market context, and key market relationships.",
    url: "https://intellitrade.tech/silver-price-today",
    siteName: "IntelliTrade",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Silver Price Today (XAG/USD) · IntelliTrade",
    description: "Live silver price in USD with daily chart and market context.",
  },
};

const schema = {
  "@context": "https://schema.org",
  "@type": "WebPage",
  name: "Silver Price Today (XAG/USD)",
  description:
    "Live silver price in USD. Real-time XAG/USD quote, daily chart, market context, and key market relationships.",
  url: "https://intellitrade.tech/silver-price-today",
  publisher: { "@type": "Organization", name: "IntelliTrade", url: "https://intellitrade.tech" },
  breadcrumb: {
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: "https://intellitrade.tech/" },
      { "@type": "ListItem", position: 2, name: "Silver Price Today", item: "https://intellitrade.tech/silver-price-today" },
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
      <SilverPriceTodayPage />
    </>
  );
}
