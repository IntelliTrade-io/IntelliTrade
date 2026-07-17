import '@/styles/main.css';
import { Space_Grotesk } from 'next/font/google';
import Footer from '@/components/layout/Footer';
import siteMetadata from '@/data/blog/siteMetadata';
import { ThemeProvider } from 'next-themes';
import { Metadata } from 'next';
import './globals.css';
import ParticlesBackground from '@/components/layout/Particles';
import Link from "next/link";
import Image from "next/image";
import IntelliTradeLogo from "@/assets/images/intelliTrade.png";
import { AuthButton } from "@/components/auth/AuthButton";
import NavLinks from "@/components/layout/NavLinks";
import MobileNav from "@/components/layout/MobileNav";
import TradingViewNavTicker from "@/components/layout/TradingViewNavTicker";
import { hasEnvVars } from "@/lib/utils";
import { Analytics } from '@vercel/analytics/react';
import Script from "next/script";
import { GA_TRACKING_ID } from "@/lib/gtag";
import GATracker from '@/components/layout/GATracker';
import ConsentBanner from '@/components/layout/ConsentBanner';


const space_grotesk = Space_Grotesk({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-space-grotesk',
});


export const metadata: Metadata = {
  metadataBase: new URL('https://intellitrade.tech'),
  title: 'IntelliTrade',
  description: 'Professional-grade trading tools, macro analysis and market context for disciplined traders.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  // Analytics + AdSense only load in production. In dev they'd pollute GA4 with
  // localhost traffic and fire ad requests against an unapproved site.
  const isProd = process.env.NODE_ENV === "production";
  return (
    <html lang={siteMetadata.language} className={`${space_grotesk.variable} scroll-smooth`} suppressHydrationWarning>
      <head>
        <link rel="apple-touch-icon" sizes="76x76" href="/static/favicons/apple-touch-icon.png" />
        <link rel="icon" type="image/png" sizes="32x32" href="/static/favicons/favicon-32x32.png" />
        <link rel="icon" type="image/png" sizes="16x16" href="/static/favicons/favicon-16x16.png" />
        <link rel="manifest" href="/static/favicons/site.webmanifest" />
        <meta name="msapplication-TileColor" content="#000000" />
        <meta name="theme-color" content="#fff" media="(prefers-color-scheme: light)" />
        <meta name="theme-color" content="#000" media="(prefers-color-scheme: dark)" />
        <meta name="google-adsense-account" content="ca-pub-4817545358384465"></meta>
        <link rel="alternate" type="application/rss+xml" href="/feed.xml" />
  {isProd && (
    <>
      {/* Google Consent Mode v2: everything denied until the banner records a
          choice (ConsentBanner applies stored/updated consent). Must run before
          gtag.js loads. */}
      <Script id="consent-default" strategy="beforeInteractive">
        {`
          window.dataLayer = window.dataLayer || [];
          function gtag(){dataLayer.push(arguments);}
          gtag('consent', 'default', {
            ad_storage: 'denied',
            ad_user_data: 'denied',
            ad_personalization: 'denied',
            analytics_storage: 'denied',
            wait_for_update: 500
          });
        `}
      </Script>
      <Script
        strategy="afterInteractive"
        src={`https://www.googletagmanager.com/gtag/js?id=${GA_TRACKING_ID}`}
      />
      <Script id="gtag-init" strategy="afterInteractive">
        {`
          window.dataLayer = window.dataLayer || [];
          function gtag(){dataLayer.push(arguments);}
          gtag('js', new Date());
          gtag('config', '${GA_TRACKING_ID}', { page_path: window.location.pathname });
        `}
      </Script>
      <script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-4817545358384465"
         crossOrigin="anonymous"></script>
    </>
  )}
      </head>
      <body className="relative min-h-screen bg-black">
        {/* Fixed background */}
        <ParticlesBackground />

        <ThemeProvider attribute="class" defaultTheme="dark" enableSystem disableTransitionOnChange>
          {/* Header — editorial flush bar (design 1B): full-width, quiet
              border-bottom, underline nav links, live EURUSD chip. */}
            <header className="sticky top-0 z-[9999] border-b border-white/[0.07] bg-[#08080c]/95 backdrop-blur-sm">
              <nav className="mx-auto flex h-[68px] max-w-6xl items-center justify-between px-6">
                {/* Left: logo + links */}
                <div className="flex h-full items-center gap-10">
                  <Link
                    href="/"
                    aria-label="IntelliTrade home"
                    className="relative block h-12 w-[150px] shrink-0"
                  >
                    <Image
                      src={IntelliTradeLogo}
                      width={500}
                      height={500}
                      className="nav-header-logo"
                      alt="IntelliTrade"
                    />
                  </Link>
                  <div className="hidden h-full md:flex">
                    <NavLinks />
                  </div>
                </div>
                {/* Right: ticker + auth */}
                <div className="flex items-center gap-3.5">
                  <TradingViewNavTicker />
                  <div className="hidden md:flex">
                    {!hasEnvVars ? null : <AuthButton />}
                  </div>
                  <MobileNav />
                </div>
              </nav>
            </header>

            {/* Main content */}
            <main className="w-full flex flex-col items-center relative z-10">
              {children}
            </main>

            {/* Footer */}
            <Footer />
            <ConsentBanner />
            <Analytics />
             <GATracker />
        </ThemeProvider>
      </body>
    </html>
  );
}
