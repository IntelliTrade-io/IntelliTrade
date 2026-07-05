import type { Metadata } from "next";
import { client } from "@/sanity/client";
import { type SanityDocument } from "next-sanity";
import type { SanityImageSource } from "@sanity/image-url/lib/types/types";
import BlogClientPage from "./_components/BlogClientPage";

export const metadata: Metadata = {
  title: "All Blog Posts · IntelliTrade Insights",
  description:
    "Browse all IntelliTrade macro and market analysis articles. Fundamental commentary on forex, gold, oil, crypto and global economic events.",
  alternates: { canonical: "https://intellitrade.tech/blog/all" },
  openGraph: {
    title: "All Blog Posts · IntelliTrade Insights",
    description:
      "Browse all IntelliTrade macro and market analysis articles.",
    url: "https://intellitrade.tech/blog/all",
    siteName: "IntelliTrade",
    type: "website",
  },
};

export default async function AllBlogsPage() {
  // 1. Updated query to use "image" and "publishedAt"
  const POSTS_QUERY = `*[_type == "post"] | order(publishedAt desc) {
    title,
    summary,
    "date": publishedAt,
    "slug": slug.current,
    tags,
    image // <--- Updated to match your Sanity field name
  }`;

  let posts: {
    slug: string;
    date: string;
    title: string;
    summary: string;
    tags: string[];
    image?: SanityImageSource | null;
  }[] = [];

  try {
    const rawPosts: SanityDocument[] = await client.fetch(
      POSTS_QUERY,
      {},
      { next: { revalidate: 30 } }
    );

    posts = rawPosts.map((post) => ({
      slug: post.slug || "",
      // Fallback to today if date is missing
      date: post.date || new Date().toISOString(),
      title: post.title || "",
      summary: post.summary || "",
      tags: post.tags || [],
      // 2. THIS IS THE KEY: Pass the image object to the map
      image: post.image || null, 
    }));
  } catch (err) {
    console.error("Error fetching posts from Sanity:", err);
  }

  // Pass the data to the Client Component
  return <BlogClientPage initialPosts={posts} />;
}