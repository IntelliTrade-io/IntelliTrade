import type { Metadata } from "next";
import { jsonLd } from "@/lib/jsonLd";

export const metadata: Metadata = {
  title: "Terms of Service · IntelliTrade",
  description:
    "IntelliTrade terms of service: the rules and conditions that govern use of our platform, tools, and content.",
  alternates: { canonical: "https://intellitrade.tech/termsOfService" },
  openGraph: {
    title: "Terms of Service · IntelliTrade",
    description: "Rules and conditions governing use of IntelliTrade's platform, tools, and content.",
    url: "https://intellitrade.tech/termsOfService",
    siteName: "IntelliTrade",
    type: "website",
  },
};

const webPageSchema = {
  "@context": "https://schema.org",
  "@type": "WebPage",
  name: "Terms of Service",
  url: "https://intellitrade.tech/termsOfService",
  publisher: {
    "@type": "Organization",
    name: "IntelliTrade",
    url: "https://intellitrade.tech",
  },
};

export default function TermsLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLd(webPageSchema) }}
      />
      {children}
    </>
  );
}
