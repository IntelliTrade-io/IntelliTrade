import Link from '@/components/blog/Link'
import Tag from '@/components/blog/Tag'
import siteMetadata from '@/data/blog/siteMetadata'
import { formatDate } from '@/node_modules/pliny/utils/formatDate'
import { ArrowRight } from 'lucide-react'
import Image from 'next/image'
import { client } from "@/sanity/client"
import imageUrlBuilder from "@sanity/image-url"
import '@/styles/lot-size-calculator.css'

// Standard Sanity Image Helper
const builder = imageUrlBuilder(client)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const urlFor = (source: any) => builder.image(source)

interface BlogPost {
  slug: string
  date: string
  title: string
  summary: string
  tags: string[]
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  image?: any
}

interface HomeProps {
  posts: BlogPost[]
  showAll?: boolean
}

export default function Main({ posts, showAll = false }: HomeProps) {
  const MAX_DISPLAY = 5
  const displayPosts = showAll ? posts : posts.slice(0, MAX_DISPLAY)

  return (
    <div className="py-12">
      {!showAll && (
        <div className="flex flex-col md:flex-row justify-between mb-12 gap-6 items-center">
          <div className="max-w-2xl text-center md:text-left">
            <p className="text-sm font-semibold uppercase tracking-[0.3em] text-brand mb-3">
              LATEST INSIGHTS
            </p>
            <h2 className="text-3xl md:text-4xl font-bold text-white tracking-tight">
              {siteMetadata.description}
            </h2>
          </div>

          {posts.length > MAX_DISPLAY && (
            <Link
              href="/blog/all"
              className="group flex items-center gap-2 text-sm font-medium text-brand/80 hover:text-white transition-colors"
            >
              All Posts
              <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
            </Link>
          )}
        </div>
      )}

      <ul className="grid gap-8">
        {!posts.length && <p className="text-slate-500 italic text-center py-10">No posts found.</p>}
        
        {displayPosts.map((post) => {
          const { slug, date, title, summary, tags, image } = post
          const imageUrl = image ? urlFor(image).width(600).height(400).url() : null

          return (
            <li key={slug}>
              <Link href={`/blog/${slug}`} className="block group">
                <article className="relative overflow-hidden rounded-3xl border border-white/10 bg-white/5 p-4 md:p-6 transition-all hover:border-brand/40 hover:bg-white/[0.07]">
                  <div className="radial-backdrop" />
                  
                  {/* Subtle Card Glow */}
                  <div className="absolute -right-20 -top-20 h-40 w-40 rounded-full bg-brand/5 blur-[80px] group-hover:bg-brand/10 transition-colors" />
                  
                  <div className="relative z-10 flex flex-col md:flex-row gap-6 lg:gap-8">
                    {/* Thumbnail Image */}
                    {imageUrl && (
                      <div className="relative aspect-[16/10] w-full md:w-64 lg:w-72 shrink-0 overflow-hidden rounded-2xl border border-white/10">
                        <Image
                          src={imageUrl}
                          alt={title}
                          fill
                          className="object-cover transition-transform duration-500 group-hover:scale-105"
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                      </div>
                    )}

                    <div className="flex flex-col justify-center flex-1 space-y-4">
                      <div className="flex items-center gap-4">
                        <time className="text-sm font-medium text-slate-500" dateTime={date}>
                          {formatDate(date, siteMetadata.locale)}
                        </time>
                        <div className="flex flex-wrap gap-2">
                          {tags.slice(0, 1).map((tag) => (
                            <Tag key={tag} text={tag} />
                          ))}
                        </div>
                      </div>

                      <h3 className="text-xl md:text-2xl font-bold leading-tight text-white group-hover:text-brandLight/90 transition-colors">
                        {title}
                      </h3>

                      <p className="prose max-w-none text-slate-400 text-sm leading-relaxed line-clamp-2 md:line-clamp-3">
                        {summary}
                      </p>
                    </div>

                    <div className="hidden lg:flex items-center justify-center self-center w-12 h-12 rounded-full border border-white/10 bg-white/5 group-hover:border-brand/40 group-hover:text-brand transition-all">
                       <ArrowRight className="w-5 h-5" />
                    </div>
                  </div>
                </article>
              </Link>
            </li>
          )
        })}
      </ul>
    </div>
  )
}