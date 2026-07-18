import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { client } from "@/sanity/client";
import { cleanPostTitle } from "@/lib/blog";
import { jsonLd } from "@/lib/jsonLd";
import { type SanityDocument } from "next-sanity";
import type { SanityImageSource } from "@sanity/image-url/lib/types/types";
import BlogClientPage from "./_components/BlogClientPage";

// Server-side pagination (?page=N): every page is real crawlable HTML with
// plain <a> links between pages, instead of the previous client-only slicing
// where crawlers without JS only ever saw page 1.
const POSTS_PER_PAGE = 6;

const POSTS_QUERY = `*[_type == "post"] | order(publishedAt desc) {
  title,
  summary,
  "date": publishedAt,
  "slug": slug.current,
  tags,
  image
}`;

interface Post {
  slug: string;
  date: string;
  title: string;
  summary: string;
  tags: string[];
  image?: SanityImageSource | null;
}

async function fetchPosts(): Promise<Post[]> {
  try {
    const rawPosts: SanityDocument[] = await client.fetch(POSTS_QUERY, {}, { next: { revalidate: 30 } });
    return rawPosts.map((post) => ({
      slug: post.slug || "",
      date: post.date || new Date().toISOString(),
      title: cleanPostTitle(post.title),
      summary: post.summary || "",
      tags: post.tags || [],
      image: post.image || null,
    }));
  } catch (err) {
    console.error("Error fetching posts from Sanity:", err);
    return [];
  }
}

/** Page 1 lives at the bare URL; ?page=1 redirects there so no duplicate exists. */
function parsePageParam(raw: string | undefined): number | null {
  if (raw === undefined) return 1;
  if (!/^[0-9]{1,4}$/.test(raw)) return null;
  const n = Number(raw);
  return n >= 2 ? n : null;
}

interface PageProps {
  searchParams: Promise<{ page?: string }>;
}

export async function generateMetadata({ searchParams }: PageProps): Promise<Metadata> {
  const page = parsePageParam((await searchParams).page) ?? 1;
  const suffix = page > 1 ? ` · Page ${page}` : "";
  const url = page > 1 ? `https://intellitrade.tech/blog/all?page=${page}` : "https://intellitrade.tech/blog/all";
  return {
    title: `All Blog Posts${suffix} · IntelliTrade Insights`,
    description:
      "Browse all IntelliTrade macro and market analysis articles. Fundamental commentary on forex, gold, oil, crypto and global economic events.",
    alternates: { canonical: url },
    openGraph: {
      title: `All Blog Posts${suffix} · IntelliTrade Insights`,
      description: "Browse all IntelliTrade macro and market analysis articles.",
      url,
      siteName: "IntelliTrade",
      type: "website",
    },
  };
}

export default async function AllBlogsPage({ searchParams }: PageProps) {
  const rawPage = (await searchParams).page;
  const page = parsePageParam(rawPage);
  // Garbage or ?page=1 → the bare URL, so there is exactly one URL per page.
  if (page === null) redirect("/blog/all");

  const posts = await fetchPosts();
  const totalPages = Math.max(1, Math.ceil(posts.length / POSTS_PER_PAGE));
  if (page > totalPages) notFound();

  const start = (page - 1) * POSTS_PER_PAGE;
  const currentPosts = posts.slice(start, start + POSTS_PER_PAGE);

  const pageUrl =
    page > 1 ? `https://intellitrade.tech/blog/all?page=${page}` : "https://intellitrade.tech/blog/all";

  const collectionSchema = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: `All Blog Posts${page > 1 ? ` · Page ${page}` : ""} · IntelliTrade Insights`,
    description:
      "Browse all IntelliTrade macro and market analysis articles. Fundamental commentary on forex, gold, oil, crypto and global economic events.",
    url: pageUrl,
    publisher: { "@type": "Organization", name: "IntelliTrade", url: "https://intellitrade.tech" },
    breadcrumb: {
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Home", item: "https://intellitrade.tech/" },
        { "@type": "ListItem", position: 2, name: "Blog", item: "https://intellitrade.tech/blog" },
        { "@type": "ListItem", position: 3, name: "All Blog Posts", item: "https://intellitrade.tech/blog/all" },
      ],
    },
    mainEntity: {
      "@type": "ItemList",
      itemListElement: currentPosts.map((post, index) => ({
        "@type": "ListItem",
        position: start + index + 1,
        url: `https://intellitrade.tech/blog/${post.slug}`,
        name: post.title,
      })),
    },
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(collectionSchema) }} />
      <BlogClientPage posts={currentPosts} currentPage={page} totalPages={totalPages} />
    </>
  );
}
