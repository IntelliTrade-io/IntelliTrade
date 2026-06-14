import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Statement · IntelliTrade",
  description:
    "IntelliTrade privacy statement — how we collect, use, and protect your personal data.",
  alternates: { canonical: "https://intellitrade.tech/privacyStatement" },
  openGraph: {
    title: "Privacy Statement · IntelliTrade",
    description: "How IntelliTrade collects, uses, and protects your personal data.",
    url: "https://intellitrade.tech/privacyStatement",
    siteName: "IntelliTrade",
    type: "website",
  },
};

const webPageSchema = {
  "@context": "https://schema.org",
  "@type": "WebPage",
  name: "Privacy Statement",
  url: "https://intellitrade.tech/privacyStatement",
  publisher: {
    "@type": "Organization",
    name: "IntelliTrade",
    url: "https://intellitrade.tech",
  },
};

export default function PrivacyLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(webPageSchema) }}
      />
      {children}
    </>
  );
}
