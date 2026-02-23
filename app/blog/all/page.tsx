import { client } from "@/sanity/client";
import { type SanityDocument } from "next-sanity";
import BlogClientPage from "./BlogClientPage";

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

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let posts: any[] = [];

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