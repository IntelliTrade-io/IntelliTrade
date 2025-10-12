import { client } from "@/sanity/client";
import Main from "@/app/blog/Main";
import { type SanityDocument } from "next-sanity";

export default async function AllBlogsPage() {
  const POSTS_QUERY = `*[_type == "post" && defined(slug.current)]
    | order(coalesce(publishedAt, "1970-01-01") desc){
      _id,
      title,
      slug,
      publishedAt,
      summary,
      tags
  }`;

  let posts: {
    slug: string;
    date: string;
    title: string;
    summary: string;
    tags: string[];
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
    }));
  } catch (err) {
    console.error("Error fetching posts from Sanity:", err);
  }

  return (
    <div className="flex-1 w-full flex flex-col items-center mt-8 px-4 max-w-5xl">
      <h1 className="text-3xl font-bold mb-8 text-white text-center pt-5">
        All Blog Posts
      </h1>
      {posts.length > 0 ? (
        <Main posts={posts} showAll={true} />
      ) : (
        <p className="text-center mt-20">
          No posts found. Check your Sanity content or make sure posts have slugs.
        </p>
      )}
    </div>
  );
}
