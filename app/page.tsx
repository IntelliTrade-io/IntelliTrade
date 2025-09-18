import { client } from "@/sanity/client";
import Main from "@/app/blog/Main"; // your Home component
import Link from "next/link";
import Image from "next/image";
import IntelliTradeLogo from "@/assets/images/intelliTrade.png";
import { AuthButton } from "@/components/auth-button";
import { hasEnvVars } from "@/lib/utils";
import ParticlesBackground from "@/components/particles";
import { type SanityDocument } from "next-sanity";

export default async function BlogPage() {
  const POSTS_QUERY = `*[_type == "post" && defined(slug.current)]
    | order(coalesce(publishedAt, "1970-01-01") desc)[0...12]{
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
    const rawPosts: SanityDocument[] = await client.fetch(POSTS_QUERY, {}, { next: { revalidate: 30 } });

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
    <main className="relative min-h-[80vh] flex flex-col">
      {/* Particle background */}
      <div className="absolute inset-0 -z-10">
        <ParticlesBackground />
      </div>

      {/* Header */}
      <div className="flex-1 w-full flex flex-col justify-content items-center">
      <nav className="w-full flex justify-center border-b border-b-foreground/10 h-16 z-[3] relative">
        <div className="w-full max-w-5xl flex justify-between items-center p-3 px-5 text-sm mx-auto">
          <div className="flex gap-5 items-center font-semibold">
            <Link href="/">
              <Image
                src={IntelliTradeLogo}
                width={500}
                height={500}
                className="nav-header-logo"
                alt="IntelliTrade"
              />
            </Link>
          </div>
          {!hasEnvVars ? <div>EnvVars missing</div> : <AuthButton />}
        </div>
      </nav>

      {/* Blog content */}
      <div className="flex-1 w-full flex flex-col items-center mt-8 relative z-10">
        <div className="w-full max-w-5xl px-4">
          {posts.length > 0 ? (
            <Main posts={posts} />
          ) : (
            <p className="text-center mt-20">
              No posts found. Check your Sanity content or make sure posts have slugs.
            </p>
          )}
        </div>
      </div>
</div>
    </main>
  );
}
