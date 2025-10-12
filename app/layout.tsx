import 'styles/tailwind.css'
// import '@/node_nodules/pliny/search/'
import 'remark-github-blockquote-alert/alert.css'
import { Geist } from "next/font/google";
import { Space_Grotesk } from 'next/font/google'
import { Analytics, AnalyticsConfig } from 'pliny/analytics'
import { SearchProvider, SearchConfig } from 'pliny/search'
import Footer from '@/components/blog/Footer'
import siteMetadata from '@/data/blog/siteMetadata'
import { ThemeProvider } from 'next-themes'
import { Metadata } from 'next'
import '@/styles/lot-size-calculator.css'; 
import "./globals.css";
import ParticlesBackground from "@/components/particles";

const space_grotesk = Space_Grotesk({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-space-grotesk',
})

// export const metadata: Metadata = {
//   metadataBase: new URL(siteMetadata.siteUrl),
//   title: {
//     default: siteMetadata.title,
//     template: `%s | ${siteMetadata.title}`,
//   },
//   description: siteMetadata.description,
// }


const defaultUrl = process.env.VERCEL_URL
  ? `https://${process.env.VERCEL_URL}`
  : "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(defaultUrl),
  title: "IntelliTrade",
  description: "IntelliTrade - Where smarter trading starts.",
};

const geistSans = Geist({
  variable: "--font-geist-sans",
  display: "swap",
  subsets: ["latin"],
});


export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const basePath = process.env.BASE_PATH || ''
  return (
    <html
      lang={siteMetadata.language}
      className={`${space_grotesk.variable} scroll-smooth`}
      suppressHydrationWarning
    >
      <head>
      <link rel="apple-touch-icon" sizes="76x76" href={`${basePath}/static/favicons/apple-touch-icon.png`} />
      <link rel="icon" type="image/png" sizes="32x32" href={`${basePath}/static/favicons/favicon-32x32.png`} />
      <link rel="icon" type="image/png" sizes="16x16" href={`${basePath}/static/favicons/favicon-16x16.png`} />
      <link rel="manifest" href={`${basePath}/static/favicons/site.webmanifest`} />
      <link rel="stylesheet" href="https://sibforms.com/forms/end-form/build/sib-styles.css"></link>
      <script defer src="https://sibforms.com/forms/end-form/build/main.js"></script>
<script src="https://www.google.com/recaptcha/api.js?render=6Ld_hWErAAAAAOESFLa9SSrFFVEuC9chPz4Hk8QP&hl=en" async defer></script>
      <meta name="msapplication-TileColor" content="#000000" />
      <meta name="theme-color" content="#fff" media="(prefers-color-scheme: light)" />
      <meta name="theme-color" content="#000" media="(prefers-color-scheme: dark)" />
      <link rel="alternate" type="application/rss+xml" href={`${basePath}/feed.xml`} />
<script
          async
          src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-4817545358384465"
          crossOrigin="anonymous"
        ></script>
        </head>
      <body className={`${geistSans.className} antialiased`}>
        <ParticlesBackground />
        <ThemeProvider
          attribute="class"
          defaultTheme="dark"
          enableSystem
          disableTransitionOnChange
        >
          <Analytics analyticsConfig={siteMetadata.analytics as typeof AnalyticsConfig} />
          {/* <SectionContainer> */}
            <SearchProvider searchConfig={siteMetadata.search as typeof SearchConfig}>
              {children}
              <Footer  /> {/* only 1 footer */}
            </SearchProvider>
          {/* </SectionContainer> */}
        </ThemeProvider>
      </body>
    </html>
  )
}
