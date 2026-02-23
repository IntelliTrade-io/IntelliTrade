import 'styles/tailwind.css'
import 'remark-github-blockquote-alert/alert.css'
import { SearchProvider } from 'pliny/search'
import siteMetadata from '@/data/blog/siteMetadata'
import { ThemeProviders } from './theme-providers'
import { Analytics } from 'pliny/analytics'

export default function BlogLayout({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProviders>
      <Analytics analyticsConfig={siteMetadata.analytics as unknown} />
      <SearchProvider searchConfig={siteMetadata.search as unknown}>
        {/* We remove html/body and just provide a semantic wrapper */}
        <div className="w-full max-w-5xl px-4 sm:px-6 xl:px-0">
          <main className="mb-auto">{children}</main>
        </div>
      </SearchProvider>
    </ThemeProviders>
  )
}