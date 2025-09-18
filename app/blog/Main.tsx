import Link from '@/components/blog/Link'
import Tag from '@/components/blog/Tag'
import siteMetadata from '@/data/blog/siteMetadata'
import { formatDate } from '@/node_modules/pliny/utils/formatDate' // fixed import path (no /node_modules)
import '@/styles/lot-size-calculator.css'

const MAX_DISPLAY = 5

// Define the shape of a blog post
interface BlogPost {
  slug: string
  date: string
  title: string
  summary: string
  tags: string[]
}

// Props for Home component
interface HomeProps {
  posts: BlogPost[]
}

export default function Home({ posts }: HomeProps) {
  return (
    <>
      <div className="divide-y divide-gray-200 dark:divide-gray-700 blog-container">
        <div className="space-y-2 pt-6 pb-8 md:space-y-5">
          <p className="text-lg leading-7 text-white dark:text-gray-400">
            {siteMetadata.description}
          </p>
        </div>

        <ul className="divide-y divide-gray-200 dark:divide-gray-700">
          {!posts.length && 'No posts found.'}

          {posts.slice(0, MAX_DISPLAY).map((post) => {
            const { slug, date, title, summary, tags } = post
            return (
              <li key={slug} className="py-12">
                <article>
                  <div className="space-y-2 xl:grid xl:grid-cols-4 xl:items-baseline xl:space-y-0">
                    {/* Date */}
                    <dl>
                      <dt className="sr-only">Published on</dt>
                      <dd className="text-base leading-6 font-medium text-white dark:text-gray-400">
                        <time dateTime={date}>
                          {formatDate(date, siteMetadata.locale)}
                        </time>
                      </dd>
                    </dl>

                    {/* Content */}
                    <div className="space-y-5 xl:col-span-3">
                      <div className="space-y-6">
                        <div>
                          <h2 className="text-2xl leading-8 font-bold tracking-tight">
                            <Link
                              href={`/blog/${slug}`}
                              className="text-white dark:text-gray-100"
                            >
                              {title}
                            </Link>
                          </h2>
                          <div className="flex flex-wrap">
                            {tags.map((tag) => (
                              <Tag key={tag} text={tag} />
                            ))}
                          </div>
                        </div>
                        <div className="prose max-w-none text-white dark:text-gray-400">
                          {summary}
                        </div>
                      </div>

                      {/* Read more */}
                      <div className="text-base leading-6 font-medium">
                        <Link
                          href={`/blog/${slug}`}
                          className="text-primary-500 hover:text-primary-600 dark:hover:text-primary-400"
                          aria-label={`Read more: "${title}"`}
                        >
                          Read more &rarr;
                        </Link>
                      </div>
                    </div>
                  </div>
                </article>
              </li>
            )
          })}
        </ul>
      </div>

      {/* Show "All Posts" link if more than MAX_DISPLAY */}
      {posts.length > MAX_DISPLAY && (
        <div className="flex justify-end text-base leading-6 font-medium">
          <Link
            href="/blog"
            className="text-primary-500 hover:text-primary-600 dark:hover:text-primary-400"
            aria-label="All posts"
          >
            All Posts &rarr;
          </Link>
        </div>
      )}
    </>
  )
}
