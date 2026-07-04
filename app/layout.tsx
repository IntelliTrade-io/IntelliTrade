import '@/styles/tailwind.css';
import '@/styles/main.css';
import { Space_Grotesk } from 'next/font/google';
import Footer from '@/components/Footer';
import siteMetadata from '@/data/blog/siteMetadata';
import { ThemeProvider } from 'next-themes';
import { Metadata } from 'next';
import './globals.css';
import ParticlesBackground from '@/components/particles';
import Link from "next/link";
import Image from "next/image";
import IntelliTradeLogo from "@/assets/images/intelliTrade.png";
import { AuthButton } from "@/components/auth-button";
import NavLinks from "@/components/nav-links";
import MobileNav from "@/components/MobileNav";
import { hasEnvVars } from "@/lib/utils";
import { Analytics } from '@vercel/analytics/react';
import Script from "next/script";
import { GA_TRACKING_ID } from "@/lib/gtag";
import GATracker from '@/components/GAtracker';


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
      </head>
      <body className="relative min-h-screen bg-black">
        {/* Fixed background */}
        <ParticlesBackground />

        <ThemeProvider attribute="class" defaultTheme="dark" enableSystem disableTransitionOnChange>
          {/* Header */}
            <nav className="sticky top-0 w-full h-16 bg-white/5 backdrop-blur-md border-b border-white/10 z-[9999]" style={{ overflow: "visible" }}>
              <div className="w-full max-w-5xl flex items-center h-full px-5 mx-auto">
                {/* Logo — left */}
                <div className="flex-1">
                  <div style={{ position: "relative", height: "48px", width: "150px", flexShrink: 0 }}>
                    <Link href="/" aria-label="IntelliTrade home" style={{ position: "absolute", inset: 0, zIndex: 1 }} />
                    <Image
                      src={IntelliTradeLogo}
                      width={500}
                      height={500}
                      className="nav-header-logo"
                      alt="IntelliTrade"
                    />
                  </div>
                </div>
                {/* Nav links — center */}
                <div className="hidden md:flex">
                  <NavLinks />
                </div>
                {/* Auth — right */}
                <div className="flex-1 hidden md:flex justify-end">
                  {!hasEnvVars ? null : <AuthButton />}
                </div>
                <MobileNav />
              </div>
            </nav>

            {/* Main content */}
            <main className="w-full flex flex-col items-center relative z-10">
              {children}
            </main>

            {/* Footer */}
            <Footer />
            <Analytics />
             <GATracker />
        </ThemeProvider>
      </body>
    </html>
  );
}
