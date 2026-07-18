// Latest-articles block for the free tool pages (internal-linking pass: tool
// pages only carried a generic /blog card, so posts got no crawl equity from
// the calculators). Server component; the tool pages that render it become ISR
// via the fetch's revalidate, matching the price pages' pattern.

import Link from "next/link";
import { client } from "@/sanity/client";
import { cleanPostTitle } from "@/lib/blog";

type PostRow = { title: string | null; slug: string | null; publishedAt: string | null };

const LATEST_POSTS_QUERY = `*[_type == "post" && defined(slug.current)] | order(publishedAt desc)[0...3]{
  title, "slug": slug.current, publishedAt
}`;

export async function LatestFromBlog() {
  let posts: PostRow[] = [];
  try {
    posts = await client.fetch<PostRow[]>(LATEST_POSTS_QUERY, {}, { next: { revalidate: 300 } });
  } catch {
    return null; // tool page renders fine without the block
  }
  if (!posts.length) return null;

  return (
    <section aria-label="Latest market analysis" className="mx-auto mt-14 w-full max-w-5xl px-4">
      <p className="text-[11px] font-semibold uppercase tracking-[0.25em] text-brand-300/90">From the blog</p>
      <h2 className="mt-2 text-xl font-semibold tracking-tight text-slate-100">Latest market analysis</h2>
      <div className="mt-5 grid gap-4 md:grid-cols-3">
        {posts.map((post) =>
          post.slug ? (
            <Link
              key={post.slug}
              href={`/blog/${post.slug}`}
              className="group rounded-2xl border border-white/15 bg-white/5 p-5 backdrop-blur-xl transition hover:border-white/20 hover:bg-white/[0.07]"
            >
              <p className="text-[15px] font-medium leading-snug text-slate-100 group-hover:text-white">
                {cleanPostTitle(post.title)}
              </p>
              {post.publishedAt && (
                <p className="mt-2 text-[12px] text-slate-400/80">
                  {new Date(post.publishedAt).toLocaleDateString("en-US", {
                    month: "long",
                    day: "numeric",
                    year: "numeric",
                  })}
                </p>
              )}
            </Link>
          ) : null,
        )}
      </div>
      <Link
        href="/blog/all"
        className="mt-4 inline-flex items-center text-[13px] font-medium text-brand-300/90 transition-colors hover:text-white"
      >
        Browse all articles →
      </Link>
    </section>
  );
}
