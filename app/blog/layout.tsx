import 'styles/tailwind.css'
// import '@/node_nodules/pliny/search/'
import 'remark-github-blockquote-alert/alert.css'

import { Space_Grotesk } from 'next/font/google'
import { Analytics, AnalyticsConfig } from 'pliny/analytics'
import { SearchProvider, SearchConfig } from 'pliny/search'
// import Footer from '@/components/blog/Footer'
import siteMetadata from '@/data/blog/siteMetadata'
import { ThemeProviders } from './theme-providers'
import { Metadata } from 'next'

const space_grotesk = Space_Grotesk({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-space-grotesk',
})

export const metadata: Metadata = {
  metadataBase: new URL(siteMetadata.siteUrl),
  title: {
    default: siteMetadata.title,
    template: `%s | ${siteMetadata.title}`,
  },
  description: siteMetadata.description,
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const basePath = process.env.BASE_PATH || ''

  return (
    <html
      lang={siteMetadata.language}
      className={`${space_grotesk.variable} scroll-smooth`}
      suppressHydrationWarning
    >
      <link rel="apple-touch-icon" sizes="76x76" href={`${basePath}/static/favicons/apple-touch-icon.png`} />
      <link rel="icon" type="image/png" sizes="32x32" href={`${basePath}/static/favicons/favicon-32x32.png`} />
      <link rel="icon" type="image/png" sizes="16x16" href={`${basePath}/static/favicons/favicon-16x16.png`} />
      <link rel="manifest" href={`${basePath}/static/favicons/site.webmanifest`} />
      <meta name="msapplication-TileColor" content="#000000" />
      <meta name="theme-color" content="#fff" media="(prefers-color-scheme: light)" />
      <meta name="theme-color" content="#000" media="(prefers-color-scheme: dark)" />
      <link rel="alternate" type="application/rss+xml" href={`${basePath}/feed.xml`} />

      <body className="bg-white text-black antialiased dark:bg-gray-950 dark:text-white">
        <ThemeProviders>
          <Analytics analyticsConfig={siteMetadata.analytics as typeof AnalyticsConfig} />
          {/* <SectionContainer> */}
            <SearchProvider searchConfig={siteMetadata.search as typeof SearchConfig}>
              {children}
              {/* <Footer  />  */}
            </SearchProvider>
          {/* </SectionContainer> */}
        </ThemeProviders>
      </body>
    </html>
  )
}
