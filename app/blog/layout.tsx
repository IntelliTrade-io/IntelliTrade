import 'styles/tailwind.css'
// import '@/node_nodules/pliny/search/'
import 'remark-github-blockquote-alert/alert.css'
import '@/styles/lot-size-calculator.css'

// import { Space_Grotesk } from 'next/font/google'
import { Analytics, AnalyticsConfig } from 'pliny/analytics'
import { SearchProvider, SearchConfig } from 'pliny/search'
// import Footer from '@/components/blog/Footer'
import siteMetadata from '@/data/blog/siteMetadata'
import { ThemeProviders } from './theme-providers'
import { Metadata } from 'next'

// const space_grotesk = Space_Grotesk({
//   subsets: ['latin'],
//   display: 'swap',
//   variable: '--font-space-grotesk',
// })

export const metadata: Metadata = {
  metadataBase: new URL(siteMetadata.siteUrl),
  title: {
    default: siteMetadata.title,
    template: `%s | ${siteMetadata.title}`,
  },
  description: siteMetadata.description,
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  // const basePath = process.env.BASE_PATH || ''

  return (
        <ThemeProviders>
          <Analytics analyticsConfig={siteMetadata.analytics as typeof AnalyticsConfig} />
          {/* <SectionContainer> */}
            <SearchProvider searchConfig={siteMetadata.search as typeof SearchConfig}>
              {children}
              {/* <Footer  />  */}
            </SearchProvider>
          {/* </SectionContainer> */}
        </ThemeProviders>
  )
}
