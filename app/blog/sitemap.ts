import { MetadataRoute } from 'next'
import type { SanityDocument } from 'next-sanity'
import { client } from '@/sanity/client'
import siteMetadata from '@/data/blog/siteMetadata'

// Slugs + dates for every published Sanity post. Previously this read the
// stale committed .contentlayer cache (old MDX starter posts), so the sitemap
// advertised posts that no longer exist and missed all real ones.
const SLUGS_QUERY = `*[_type == "post" && defined(slug.current)]{
  "slug": slug.current,
  "lastModified": coalesce(_updatedAt, publishedAt)
}`

export const revalidate = 3600

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const siteUrl = siteMetadata.siteUrl

  let posts: { slug: string; lastModified?: string }[] = []
  try {
    posts = await client.fetch<SanityDocument[]>(SLUGS_QUERY) as unknown as {
      slug: string
      lastModified?: string
    }[]
  } catch {
    // Sitemap should degrade to static routes rather than fail the build.
  }

  const blogRoutes = posts.map((post) => ({
    url: `${siteUrl}/blog/${post.slug}`,
    lastModified: post.lastModified,
  }))

  const routes = ['', 'blog'].map((route) => ({
    url: `${siteUrl}/${route}`,
    lastModified: new Date().toISOString().split('T')[0],
  }))

  return [...routes, ...blogRoutes]
}
