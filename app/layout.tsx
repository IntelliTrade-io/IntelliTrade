import '@/styles/tailwind.css';
import 'remark-github-blockquote-alert/alert.css';
import { Space_Grotesk } from 'next/font/google';
// import { Analytics, AnalyticsConfig } from 'pliny/analytics';
import { SearchProvider, SearchConfig } from 'pliny/search';
import Footer from '@/components/blog/Footer';
import siteMetadata from '@/data/blog/siteMetadata';
import { ThemeProvider } from 'next-themes';
import { Metadata } from 'next';
import './globals.css';
import ParticlesBackground from '@/components/particles';
import Link from "next/link";
import Image from "next/image";
import IntelliTradeLogo from "@/assets/images/intelliTrade.png";
import { AuthButton } from "@/components/auth-button";
import { hasEnvVars } from "@/lib/utils";
import { Analytics } from '@vercel/analytics/react';

const space_grotesk = Space_Grotesk({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-space-grotesk',
});

const defaultUrl = process.env.VERCEL_URL
  ? `https://${process.env.VERCEL_URL}`
  : 'http://localhost:3000';

export const metadata: Metadata = {
  metadataBase: new URL(defaultUrl),
  title: 'IntelliTrade',
  description: 'IntelliTrade - Where smarter trading starts.',
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
        <link rel="alternate" type="application/rss+xml" href="/feed.xml" />
        
      </head>
      <body className="relative min-h-screen bg-black">
        {/* Fixed background */}
        <ParticlesBackground />

        <ThemeProvider attribute="class" defaultTheme="dark" enableSystem disableTransitionOnChange>
          {/* <Analytics analyticsConfig={siteMetadata.analytics as typeof AnalyticsConfig} /> */}
          <SearchProvider searchConfig={siteMetadata.search as typeof SearchConfig}>
            
            {/* Header */}
            <nav className="w-full flex justify-center border-b border-b-foreground/10 h-16 relative z-10">
              <div className="w-full max-w-5xl flex justify-between items-center p-3 px-5 text-sm mx-auto">
                <div className="flex gap-5 items-center font-semibold">
                  <Link href="/">
                    <Image
                      src={IntelliTradeLogo}
                      width={500}
                      height={500}
                      className="nav-header-logo"
                      alt="IntelliTrade"
                    />
                  </Link>
                </div>
                {!hasEnvVars ? <div>EnvVars missing</div> : <AuthButton />}
              </div>
            </nav>

            {/* Main content */}
            <main className="w-full flex flex-col items-center relative z-10">
              {children}
            </main>

            {/* Footer */}
            <Footer />
            <Analytics />
          </SearchProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
