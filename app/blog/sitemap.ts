import { MetadataRoute } from 'next'
import type { SanityDocument } from 'next-sanity'
import { client } from '@/sanity/client'
import { slugifyTag } from '@/lib/blog'
import siteMetadata from '@/data/blog/siteMetadata'

// Slugs + dates for every published Sanity post. Previously this read the
// stale committed .contentlayer cache (old MDX starter posts), so the sitemap
// advertised posts that no longer exist and missed all real ones.
const SLUGS_QUERY = `*[_type == "post" && defined(slug.current)]{
  "slug": slug.current,
  "lastModified": coalesce(_updatedAt, publishedAt),
  tags
}`

export const revalidate = 3600

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const siteUrl = siteMetadata.siteUrl

  let posts: { slug: string; lastModified?: string; tags?: string[] }[] = []
  try {
    posts = await client.fetch<SanityDocument[]>(SLUGS_QUERY) as unknown as {
      slug: string
      lastModified?: string
      tags?: string[]
    }[]
  } catch {
    // Sitemap should degrade to static routes rather than fail the build.
  }

  const blogRoutes = posts.map((post) => ({
    url: `${siteUrl}/blog/${post.slug}`,
    lastModified: post.lastModified,
  }))

  // One /blog/tag/<slug> route per unique tag (tags are plain strings; pages
  // are addressed by their slugified form).
  const tagSlugs = new Set<string>()
  for (const post of posts) {
    for (const tag of post.tags ?? []) {
      const slug = slugifyTag(tag)
      if (slug) tagSlugs.add(slug)
    }
  }
  const tagRoutes = Array.from(tagSlugs).map((slug) => ({
    url: `${siteUrl}/blog/tag/${slug}`,
  }))

  const routes = ['', 'blog'].map((route) => ({
    url: `${siteUrl}/${route}`,
    lastModified: new Date().toISOString().split('T')[0],
  }))

  return [...routes, ...blogRoutes, ...tagRoutes]
}
