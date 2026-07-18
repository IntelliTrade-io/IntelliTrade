import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { client } from "@/sanity/client";
import { cleanPostTitle, collectTagCounts, slugifyTag } from "@/lib/blog";
import { jsonLd } from "@/lib/jsonLd";
import { type SanityDocument } from "next-sanity";
import type { SanityImageSource } from "@sanity/image-url/lib/types/types";
import Main from "@/app/blog/_components/Main";
import { TagChips } from "@/components/blog/TagChips";

// Programmatic tag listing pages (/blog/tag/eur-usd-outlook). Tags are plain
// English strings in Sanity; pages address them by slug and match posts by
// comparing slugified values, so case/spacing variants group together.
export const revalidate = 3600;
// New tags arrive from the publishing pipeline without a rebuild.
export const dynamicParams = true;

const TAGGED_POSTS_QUERY = `*[_type == "post" && defined(tags) && count(tags) > 0] | order(publishedAt desc) {
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

async function fetchTaggedPosts(): Promise<Post[]> {
  try {
    const rawPosts: SanityDocument[] = await client.fetch(TAGGED_POSTS_QUERY, {}, { next: { revalidate: 3600 } });
    return rawPosts.map((post) => ({
      slug: post.slug || "",
      date: post.date || new Date().toISOString(),
      title: cleanPostTitle(post.title),
      summary: post.summary || "",
      tags: post.tags || [],
      image: post.image || null,
    }));
  } catch (err) {
    console.error("Error fetching tagged posts from Sanity:", err);
    return [];
  }
}

const collectTagChips = (posts: Post[]) => collectTagCounts(posts.map((p) => p.tags));

export async function generateStaticParams() {
  const posts = await fetchTaggedPosts();
  return collectTagChips(posts).map((t) => ({ tag: t.slug }));
}

interface PageProps {
  params: Promise<{ tag: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { tag } = await params;
  const posts = await fetchTaggedPosts();
  const chip = collectTagChips(posts).find((t) => t.slug === tag);
  if (!chip) return { title: "Tag not found · IntelliTrade Insights" };

  const url = `https://intellitrade.tech/blog/tag/${chip.slug}`;
  const title = `${chip.label} · IntelliTrade Insights`;
  const description = `All IntelliTrade articles tagged "${chip.label}": macro and market analysis on forex, gold, oil, crypto and global economic events.`;
  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: { title, description, url, siteName: "IntelliTrade", type: "website" },
  };
}

export default async function BlogTagPage({ params }: PageProps) {
  const { tag } = await params;
  const posts = await fetchTaggedPosts();
  const chips = collectTagChips(posts);
  const chip = chips.find((t) => t.slug === tag);
  if (!chip) notFound();

  const tagged = posts.filter((p) => p.tags.some((t) => slugifyTag(t) === tag));
  const url = `https://intellitrade.tech/blog/tag/${chip.slug}`;

  const collectionSchema = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: `${chip.label} · IntelliTrade Insights`,
    description: `All IntelliTrade articles tagged "${chip.label}".`,
    url,
    publisher: { "@type": "Organization", name: "IntelliTrade", url: "https://intellitrade.tech" },
    breadcrumb: {
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Home", item: "https://intellitrade.tech/" },
        { "@type": "ListItem", position: 2, name: "Blog", item: "https://intellitrade.tech/blog" },
        { "@type": "ListItem", position: 3, name: chip.label, item: url },
      ],
    },
    mainEntity: {
      "@type": "ItemList",
      itemListElement: tagged.slice(0, 25).map((post, index) => ({
        "@type": "ListItem",
        position: index + 1,
        url: `https://intellitrade.tech/blog/${post.slug}`,
        name: post.title,
      })),
    },
  };

  return (
    <div className="relative bg-black text-slate-100 pb-12">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(collectionSchema) }} />
      <div className="relative z-10 w-full pt-10">
        <div className="mb-6 text-left">
          <Link
            href="/blog/all"
            className="group inline-flex items-center gap-2 text-sm font-medium text-slate-400 hover:text-brand/80 transition-colors"
          >
            <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
            All posts
          </Link>
        </div>
        <header className="mb-8 text-center">
          <div className="inline-flex items-center rounded-full border border-brand/30 bg-white/5 px-4 py-1 text-[11px] font-medium tracking-[0.22em] text-brand/90 uppercase">
            Topic
          </div>
          <h1 className="mt-6 text-4xl font-bold tracking-tight text-white md:text-5xl">{chip.label}</h1>
          <p className="mt-3 text-sm text-slate-400">
            {tagged.length} article{tagged.length === 1 ? "" : "s"} on this topic
          </p>
        </header>

        <Main posts={tagged} showAll={true} />

        <TagChips tags={chips} activeSlug={chip.slug} heading="More topics" />
      </div>
    </div>
  );
}
