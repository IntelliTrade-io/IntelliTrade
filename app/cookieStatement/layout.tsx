import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Cookie Statement · IntelliTrade",
  description:
    "IntelliTrade cookie statement — how we use cookies and similar tracking technologies on our platform.",
  alternates: { canonical: "https://intellitrade.tech/cookieStatement" },
  openGraph: {
    title: "Cookie Statement · IntelliTrade",
    description: "How IntelliTrade uses cookies and similar tracking technologies.",
    url: "https://intellitrade.tech/cookieStatement",
    siteName: "IntelliTrade",
    type: "website",
  },
};

const webPageSchema = {
  "@context": "https://schema.org",
  "@type": "WebPage",
  name: "Cookie Statement",
  url: "https://intellitrade.tech/cookieStatement",
  publisher: {
    "@type": "Organization",
    name: "IntelliTrade",
    url: "https://intellitrade.tech",
  },
};

export default function CookieLayout({ children }: { children: React.ReactNode }) {
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
