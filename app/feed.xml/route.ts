import { client } from "@/sanity/client";
import { cleanPostTitle, excerptFromPortableText } from "@/lib/blog";

const BASE = "https://intellitrade.tech";

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export const revalidate = 3600;

export async function GET() {
  let posts: {
    title: string;
    slug: string;
    summary: string | null;
    publishedAt: string | null;
    body: unknown;
  }[] = [];

  try {
    posts = await client.fetch(
      `*[_type == "post" && defined(slug.current)]
        | order(coalesce(publishedAt, "1970-01-01") desc)[0...50]{
          title, "slug": slug.current, summary, publishedAt, body
      }`,
      {},
      { next: { revalidate: 3600 } }
    );
  } catch {
    // Sanity unavailable — serve an empty channel rather than a 500
  }

  const items = posts
    .map((post) => {
      const url = `${BASE}/blog/${post.slug}`;
      return `    <item>
      <title>${escapeXml(cleanPostTitle(post.title))}</title>
      <link>${url}</link>
      <guid isPermaLink="true">${url}</guid>
      ${post.publishedAt ? `<pubDate>${new Date(post.publishedAt).toUTCString()}</pubDate>` : ""}
      <description>${escapeXml(post.summary || excerptFromPortableText(post.body, 300))}</description>
    </item>`;
    })
    .join("\n");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>IntelliTrade Insights</title>
    <link>${BASE}/blog</link>
    <atom:link href="${BASE}/feed.xml" rel="self" type="application/rss+xml"/>
    <description>Educational macro and forex market analysis from IntelliTrade.</description>
    <language>en</language>
${items}
  </channel>
</rss>`;

  return new Response(xml, {
    headers: {
      "Content-Type": "application/rss+xml; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
