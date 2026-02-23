import { PortableText, type SanityDocument } from "next-sanity";
import imageUrlBuilder from "@sanity/image-url";
import type { SanityImageSource } from "@sanity/image-url/lib/types/types";
import { client } from "@/sanity/client";
import Link from "next/link";
import Image from "next/image";
import ReadingProgressBar from "@/components/readingProgressBar"; // We'll create this next
import { ArrowLeft } from "lucide-react"; // or use your preferred icon set
import '@/styles/lot-size-calculator.css'


const POST_QUERY = `*[_type == "post" && slug.current == $slug][0]`;

const { projectId, dataset } = client.config();
const urlFor = (source: SanityImageSource) =>
  projectId && dataset ? imageUrlBuilder({ projectId, dataset }).image(source) : null;

const options = { next: { revalidate: 30 } };

export async function generateStaticParams(): Promise<{ slug: string }[]> {
  const slugs: { slug: { current: string } }[] = await client.fetch(`*[_type == "post"]{ slug }`);
  return slugs.map((s) => ({ slug: s.slug.current }));
}

export default async function PostPage({ params }: { params: { slug: string } }) {
  const post = await client.fetch<SanityDocument>(POST_QUERY, { slug: params.slug }, options);

  if (!post) return <div className="min-h-screen bg-black flex items-center justify-center">Post not found</div>;

  const postImageUrl = post.image ? urlFor(post.image)?.width(1200).height(675).url() : null;

  return (
    <div className="relative min-h-screen bg-black text-slate-100">
      {/* Scroll Progress Bar (Client Component) */}
      <ReadingProgressBar />

      {/* Aesthetic Glows */}
      {/* <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-[10%] left-1/2 -translate-x-1/2 w-[60%] h-[40%] bg-teal-500/10 blur-[120px] rounded-full" />
      </div> */}

      <div className="text-center mt-5 relative overflow-hidden rounded-3xl border border-white/20 bg-clip-padding p-6 shadow-[0_32px_80px_rgba(0,0,0,0.85)] backdrop-blur-2xl md:p-10">
        
        <div className="radial-backdrop" />
        {/* Navigation */}
        <Link 
          href="/" 
          className="group inline-flex items-center gap-2 text-sm font-medium text-slate-400 hover:text-brand/80 transition-colors mb-12"
        >
          <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
          Back to Insights
        </Link>

        {/* Header Section */}
        <header className="mb-12">
          <div className="inline-flex items-center rounded-full border border-brand/30 bg-white/5 px-4 py-1 text-[11px] font-medium tracking-[0.22em] text-brand/90 mb-6">
            {post.tags?.[0] || "ARTICLE"}
          </div>
          
          <h1 className="text-4xl md:text-5xl font-bold tracking-tight text-white mb-6 leading-tight">
            {post.title}
          </h1>

          <div className="flex items-center justify-center gap-4 text-sm text-slate-400">
            <time dateTime={post.publishedAt}>
              {new Date(post.publishedAt).toLocaleDateString('en-US', {
                month: 'long', day: 'numeric', year: 'numeric'
              })}
            </time>
            <span className="w-1 h-1 rounded-full bg-slate-700" />
            <span>{post.author || "IntelliTrade Team"}</span>
          </div>
        </header>

        {/* Featured Image */}
        {postImageUrl && (
          <div className="relative aspect-video w-full mb-16 overflow-hidden rounded-3xl border border-white/10 shadow-2xl">
            <Image
              src={postImageUrl}
              alt={post.title}
              fill
              className="object-cover"
              priority
            />
          </div>
        )}

        {/* Article Body */}
        <article className="prose prose-invert prose-brand max-w-none 
          prose-headings:font-semibold prose-headings:tracking-tight
          prose-p:text-slate-300 prose-p:leading-relaxed prose-p:text-[17px]
          prose-strong:text-white prose-blockquote:border-brand
          prose-code:text-brandLight/80 prose-code:bg-brand/10 prose-code:px-1 prose-code:rounded
          prose-img:rounded-2xl prose-img:border prose-img:border-white/10 text-sm">
          
          {Array.isArray(post.body) && (
             <PortableText value={post.body} />
          )}
        </article>

        {/* Footer CTA */}
        <footer className=" pt-12 border-t border-white/10 text-center">
           <p className="text-slate-400 text-sm mb-6">Found this insightful? Share it with your trading circle.</p>
           <div className="flex justify-center gap-4">
              {/* Add social share buttons here if needed */}
           </div>
        </footer>
      </div>
    </div>
  );
}