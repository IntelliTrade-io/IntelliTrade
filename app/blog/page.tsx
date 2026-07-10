import type { Metadata } from "next";
import { jsonLd } from "@/lib/jsonLd";
import { client } from "@/sanity/client";
import Main from "@/app/blog/_components/Main";
import { type SanityDocument } from "next-sanity";
import type { SanityImageSource } from "@sanity/image-url/lib/types/types";

export const metadata: Metadata = {
  title: "Macro Insights · IntelliTrade Blog",
  description:
    "Research-driven macro and fundamental market analysis for serious traders. Stay informed on the economic forces moving forex, gold, oil, and crypto markets.",
  alternates: { canonical: "https://intellitrade.tech/blog" },
  openGraph: {
    title: "Macro Insights · IntelliTrade Blog",
    description:
      "Research-driven macro and fundamental market analysis for serious traders.",
    url: "https://intellitrade.tech/blog",
    siteName: "IntelliTrade",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Macro Insights · IntelliTrade Blog",
    description:
      "Research-driven macro and fundamental market analysis for serious traders.",
  },
};

const blogSchema = {
  "@context": "https://schema.org",
  "@type": "Blog",
  name: "IntelliTrade Macro Insights",
  description:
    "Research-driven macro and fundamental market analysis for serious traders.",
  url: "https://intellitrade.tech/blog",
  publisher: {
    "@type": "Organization",
    name: "IntelliTrade",
    url: "https://intellitrade.tech",
  },
};

const breadcrumbSchema = {
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  itemListElement: [
    { "@type": "ListItem", position: 1, name: "Home", item: "https://intellitrade.tech/" },
    { "@type": "ListItem", position: 2, name: "Blog", item: "https://intellitrade.tech/blog" },
  ],
};

export default async function BlogPage() {
  const POSTS_QUERY = `*[_type == "post" && defined(slug.current)]
    | order(coalesce(publishedAt, "1970-01-01") desc)[0...12]{
      _id,
      title,
      slug,
      publishedAt,
      summary,
      tags,
      image
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
      slug: post.slug?.current || "",
      date: post.publishedAt || new Date().toISOString(),
      title: post.title || "",
      summary: post.summary || "",
      tags: post.tags || [],
      image: post.image || null,
    }));
  } catch (err) {
    console.error("Error fetching posts from Sanity:", err);
  }

  return (
    <div className="w-full flex flex-col items-center px-4 pt-8 pb-16">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLd(blogSchema) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLd(breadcrumbSchema) }}
      />
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
