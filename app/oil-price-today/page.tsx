import type { Metadata } from "next";
import OilPriceTodayPage from "./_components/OilPriceTodayPage";

export const metadata: Metadata = {
  title: "Oil Price Today (Brent Crude) · IntelliTrade",
  description:
    "Live Brent crude oil price in USD. Real-time Brent quote, daily chart, market context, and key market relationships — updated throughout the session.",
  alternates: { canonical: "https://intellitrade.tech/oil-price-today" },
  openGraph: {
    title: "Oil Price Today (Brent Crude) · IntelliTrade",
    description:
      "Live Brent crude oil price in USD. Real-time Brent quote, daily chart, market context, and key market relationships.",
    url: "https://intellitrade.tech/oil-price-today",
    siteName: "IntelliTrade",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Oil Price Today (Brent Crude) · IntelliTrade",
    description: "Live Brent crude oil price in USD with daily chart and market context.",
  },
};

const schema = {
  "@context": "https://schema.org",
  "@type": "WebPage",
  name: "Oil Price Today (Brent Crude)",
  description:
    "Live Brent crude oil price in USD. Real-time Brent quote, daily chart, market context, and key market relationships.",
  url: "https://intellitrade.tech/oil-price-today",
  publisher: { "@type": "Organization", name: "IntelliTrade", url: "https://intellitrade.tech" },
  breadcrumb: {
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: "https://intellitrade.tech/" },
      { "@type": "ListItem", position: 2, name: "Oil Price Today", item: "https://intellitrade.tech/oil-price-today" },
    ],
  },
};

export default function Page() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
      />
      <OilPriceTodayPage />
    </>
  );
}
