import Link from '@/components/blog/Link'
import Tag from '@/components/blog/Tag'
import siteMetadata from '@/data/blog/siteMetadata'
import { formatDate } from '@/node_modules/pliny/utils/formatDate'

// Define the shape of a blog post
interface BlogPost {
  slug: string
  date: string
  title: string
  summary: string
  tags: string[]
}

// Props for Blog component
interface BlogProps {
  posts: BlogPost[]
  showAll?: boolean // New prop to control if we show all posts or just 5
}

export default function Blog({ posts, showAll = false }: BlogProps) {
  const MAX_DISPLAY = 5
  const displayPosts = showAll ? posts : posts.slice(0, MAX_DISPLAY)

  return (
    <>
      <div className="divide-y divide-gray-200 dark:divide-gray-700 relative">
       
        <div className="space-y-2 pt-3 pb-3 md:space-y-5 flex justify-center items-center !border-t-0">
          <div>
          <p className="text-lg leading-7 !text-white !text-2xl">
            {siteMetadata.description}
          </p>
</div>

          {/* Show "All Posts" link if more than MAX_DISPLAY and not already showing all */}
        {posts.length > MAX_DISPLAY && !showAll && (
          <div className="flex justify-end absolute top-4 right-10 text-white leading-6 font-medium">
            <Link
              href="/blog/all"
              className="read-more-button flex"
              aria-label="All posts"
            >
              <p>All Posts</p>

                          <svg
    xmlns="http://www.w3.org/2000/svg"
    className="h-6 w-6"
    fill="none"
    viewBox="0 0 24 24"
    stroke="currentColor"
    strokeWidth="4"
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M14 5l7 7m0 0l-7 7m7-7H3"
    ></path>
  </svg>
                        </Link>
            
          </div>
        )}
        </div>

        <ul className="divide-y divide-gray-200 dark:divide-gray-700">
          {!posts.length && 'No posts found.'}

          {displayPosts.map((post) => {
            const { slug, date, title, summary, tags } = post
            return (
              <li key={slug} className="py-5">
                <article>
                  <div className="space-y-2 xl:grid xl:grid-cols-3 xl:items-baseline xl:space-y-0">
                    {/* Date */}

                    {/* Content */}
                    <div className="space-y-5 xl:col-span-3">
                      <dl className="text-center text-primary-400">
                      <dt className="sr-only">Published on</dt>
                      <dd className="text-base leading-6 font-medium text-white dark:text-gray-400">
                        <time dateTime={date}>
                          {formatDate(date, siteMetadata.locale)}
                        </time>
                      </dd>
                    </dl>
                      <div className="space-y-3 text-center">
                        <div>
                          <h2 className="text-xl leading-8 font-bold tracking-tight">
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
                      <div className="text-base leading-6 font-medium flex justify-end text-white dark:text-gray-400">
                        <Link
                          href={`/blog/${slug}`}
                          className="read-more-button flex"
                          aria-label={`Read more: "${title}"`}
                        >
                          <p>Read more</p>

                          <svg
    xmlns="http://www.w3.org/2000/svg"
    className="h-6 w-6"
    fill="none"
    viewBox="0 0 24 24"
    stroke="currentColor"
    stroke-width="4"
  >
    <path
      stroke-linecap="round"
      stroke-linejoin="round"
      d="M14 5l7 7m0 0l-7 7m7-7H3"
    ></path>
  </svg>
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
    </>
  )
}