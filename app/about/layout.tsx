import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "About IntelliTrade · Where Smarter Trading Starts",
  description:
    "IntelliTrade is a macro-first trading analysis platform built for clarity, context, and disciplined decision-making. Learn about our mission, tools, and approach.",
  alternates: { canonical: "https://intellitrade.tech/about" },
  openGraph: {
    title: "About IntelliTrade · Where Smarter Trading Starts",
    description:
      "IntelliTrade is a macro-first trading analysis platform built for clarity, context, and disciplined decision-making.",
    url: "https://intellitrade.tech/about",
    siteName: "IntelliTrade",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "About IntelliTrade",
    description:
      "A macro-first trading analysis platform built for clarity, context, and disciplined decision-making.",
  },
};

const aboutSchema = {
  "@context": "https://schema.org",
  "@type": "AboutPage",
  name: "About IntelliTrade",
  description:
    "IntelliTrade is a macro-first trading analysis platform offering educational market commentary, trading tools, and risk-management utilities for traders.",
  url: "https://intellitrade.tech/about",
  publisher: {
    "@type": "Organization",
    name: "IntelliTrade",
    url: "https://intellitrade.tech",
  },
};

export default function AboutLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(aboutSchema) }}
      />
      {children}
    </>
  );
}
