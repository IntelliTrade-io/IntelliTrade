import type { Metadata } from "next";
import { jsonLd } from "@/lib/jsonLd";

export const metadata: Metadata = {
  title: "Lot Size Calculator Guide & FAQ · IntelliTrade",
  description:
    "Complete guide to position sizing for forex, gold and indices. Learn what position sizing is, how lot size is calculated, and how to use the IntelliTrade calculator correctly.",
  alternates: { canonical: "https://intellitrade.tech/lotsizecalculator/faq" },
  openGraph: {
    title: "Lot Size Calculator Guide & FAQ · IntelliTrade",
    description:
      "Complete guide to position sizing for forex, gold and indices. Learn how lot size is calculated and how to manage risk effectively.",
    url: "https://intellitrade.tech/lotsizecalculator/faq",
    siteName: "IntelliTrade",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Lot Size Calculator Guide & FAQ · IntelliTrade",
    description:
      "Complete guide to position sizing for forex, gold and indices.",
  },
};

const articleSchema = {
  "@context": "https://schema.org",
  "@type": "Article",
  headline: "Lot Size Calculator Guide & FAQ",
  description:
    "Complete guide to position sizing for forex, gold and indices. Learn what position sizing is, how lot size is calculated, and how to manage risk effectively.",
  url: "https://intellitrade.tech/lotsizecalculator/faq",
  author: {
    "@type": "Organization",
    name: "IntelliTrade",
    url: "https://intellitrade.tech",
  },
  publisher: {
    "@type": "Organization",
    name: "IntelliTrade",
    url: "https://intellitrade.tech",
  },
  breadcrumb: {
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: "https://intellitrade.tech/" },
      { "@type": "ListItem", position: 2, name: "Lot Size Calculator", item: "https://intellitrade.tech/lotsizecalculator" },
      { "@type": "ListItem", position: 3, name: "Guide & FAQ", item: "https://intellitrade.tech/lotsizecalculator/faq" },
    ],
  },
};

export default function FaqLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLd(articleSchema) }}
      />
      {children}
    </>
  );
}
