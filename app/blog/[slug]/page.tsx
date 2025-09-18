import { PortableText, type SanityDocument } from "next-sanity";
import imageUrlBuilder from "@sanity/image-url";
import type { SanityImageSource } from "@sanity/image-url/lib/types/types";
import { client } from "@/sanity/client";
import Link from "next/link";
import Image from "next/image";
import IntelliTradeLogo from "@/assets/images/intelliTrade.png";
import { AuthButton } from "@/components/auth-button";
import { hasEnvVars } from "@/lib/utils";
import ParticlesBackground from "@/components/particles";
import "@/styles/lot-size-calculator.css";

const POST_QUERY = `*[_type == "post" && slug.current == $slug][0]`;

const { projectId, dataset } = client.config();
const urlFor = (source: SanityImageSource) =>
  projectId && dataset
    ? imageUrlBuilder({ projectId, dataset }).image(source)
    : null;

const options = { next: { revalidate: 30 } };

export async function generateStaticParams() {
  const slugs: { slug: { current: string } }[] = await client.fetch(
    `*[_type == "post"]{ slug }`
  );

  return slugs.map((s) => ({
    slug: s.slug.current,
  }));
}

export default async function PostPage({ params }: { params: { slug: string } }) {
  const post = await client.fetch<SanityDocument>(POST_QUERY, { slug: params.slug }, options);

  if (!post) return <div>Post not found</div>;

  const postImageUrl = post.image
    ? urlFor(post.image)?.width(550).height(310).url()
    : null;

  return (
    <main className="relative min-h-[80vh] flex flex-col">
      {/* Particle background */}
      <ParticlesBackground className="absolute inset-0 -z-10" />

      {/* Header */}
      <div className="flex-1 w-full flex flex-col justify-start items-center">
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
          <div className="px-4 blog-container">
            <Link href="/" className="hover:underline">
              ← Back to posts
            </Link>

            {postImageUrl && (
              <Image
                src={postImageUrl}
                alt={post.title}
                width={550}
                height={310}
                className="aspect-video rounded-xl"
              />
            )}

            <h1 className="text-4xl font-bold mb-8">{post.title}</h1>

            <div className="prose max-w-none">
              <p>Published: {new Date(post.publishedAt).toLocaleDateString()}</p>
              {Array.isArray(post.body) && <PortableText value={post.body} />}
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
