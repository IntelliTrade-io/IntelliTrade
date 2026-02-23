import { client } from "@/sanity/client";
import Main from "@/app/blog/Main";
import { type SanityDocument } from "next-sanity";

export default async function BlogPage() {
  // 1. Added "mainImage" to the query
  const POSTS_QUERY = `*[_type == "post" && defined(slug.current)]
    | order(coalesce(publishedAt, "1970-01-01") desc)[0...12]{
      _id,
      title,
      slug,
      publishedAt,
      summary,
      tags,
      image // <--- Fetch the image object from Sanity
  }`;

  let posts: {
    slug: string;
    date: string;
    title: string;
    summary: string;
    tags: string[];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    image?: any; // 2. Added image to the type definition
  }[] = [];

  

  try {
    const rawPosts: SanityDocument[] = await client.fetch(
      POSTS_QUERY,
      {},
      { next: { revalidate: 30 } }
    );

  posts = rawPosts.map((post) => ({
      slug: post.slug?.current || "",
      date: post.publishedAt || new Date().toISOString(),
      title: post.title || "",
      summary: post.summary || "",
      tags: post.tags || [],
      image: post.image || null, // <--- Map the image field
    }));
    
  } catch (err) {
    console.error("Error fetching posts from Sanity:", err);
  }

  return (
    <div className="w-full flex flex-col items-center px-4 pt-8 pb-16">
      <div className="w-full max-w-5xl">
        {posts.length > 0 ? (
          <Main posts={posts} showAll={false} />
        ) : (
          <p className="text-center mt-20 text-white">
            No posts found. Check your Sanity content or make sure posts have slugs.
          </p>
        )}
      </div>
    </div>
  );
}