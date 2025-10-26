import { PortableText, type SanityDocument } from "next-sanity";
import imageUrlBuilder from "@sanity/image-url";
import type { SanityImageSource } from "@sanity/image-url/lib/types/types";
import { client } from "@/sanity/client";
import Link from "next/link";
import Image from "next/image";

const POST_QUERY = `*[_type == "post" && slug.current == $slug][0]`;

const { projectId, dataset } = client.config();
const urlFor = (source: SanityImageSource) =>
  projectId && dataset
    ? imageUrlBuilder({ projectId, dataset }).image(source)
    : null;

const options = { next: { revalidate: 30 } };


export async function generateStaticParams(): Promise<{ slug: string }[]> {
  const slugs: { slug: { current: string } }[] = await client.fetch(
    `*[_type == "post"]{ slug }`
  );

  return slugs.map((s) => ({
    slug: s.slug.current,
  }));
}


interface PostPageProps {
  params: {
    slug: string;
  };
}
export default async function PostPage({ params }: PostPageProps) {
  const post = await client.fetch<SanityDocument>(
    POST_QUERY,
    { slug: params.slug },
    options
  );

  if (!post) return <div>Post not found</div>;

  const postImageUrl = post.image
    ? urlFor(post.image)?.width(550).height(310).url()
    : null;

  return (
    
      <div className="flex-1 w-full flex flex-col justify-start items-center">
        
        {/* Blog content */}
        <div className="flex-1 w-full flex flex-col items-center mt-8 relative z-10 text-white">
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
  );
}
