"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import Main from "@/app/blog/_components/Main";
import type { SanityImageSource } from "@sanity/image-url/lib/types/types";

interface Post {
  slug: string;
  date: string;
  title: string;
  summary: string;
  tags: string[];
  image?: SanityImageSource | null;
}

interface BlogClientPageProps {
  /** The posts for the current page only — slicing happens on the server. */
  posts: Post[];
  currentPage: number;
  totalPages: number;
}

function getVisiblePages(current: number, total: number): (number | "…")[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const pages: (number | "…")[] = [1];
  if (current > 3) pages.push("…");
  for (let i = Math.max(2, current - 1); i <= Math.min(total - 1, current + 1); i++) pages.push(i);
  if (current < total - 2) pages.push("…");
  pages.push(total);
  return pages;
}

/** Page 1 is the bare URL; deeper pages use ?page=N (matches the canonical). */
const pageHref = (n: number) => (n === 1 ? "/blog/all" : `/blog/all?page=${n}`);

export default function BlogClientPage({ posts, currentPage, totalPages }: BlogClientPageProps) {
  return (
    <div className="relative bg-black text-slate-100 pb-12">
      <div className="relative z-10 w-full pt-10">
        <div className="mb-6 text-left">
          <Link href="/blog" className="group inline-flex items-center gap-2 text-sm font-medium text-slate-400 hover:text-brand/80 transition-colors">
            <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
            Back to insights
          </Link>
        </div>
        <header className="mb-8 text-center">
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="inline-flex items-center rounded-full border border-brand/30 bg-white/5 px-4 py-1 text-[11px] font-medium tracking-[0.22em] text-brand/90"
          >
            INTELLITRADE INSIGHTS
          </motion.div>
          <motion.h1
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="mt-6 text-4xl font-bold tracking-tight text-white md:text-5xl"
          >
            All Blog Posts
          </motion.h1>
          {currentPage > 1 && (
            <p className="mt-3 text-sm text-slate-400">
              Page {currentPage} of {totalPages}
            </p>
          )}
        </header>

        {posts.length > 0 ? (
          <div className="space-y-12">
            <motion.div
              key={currentPage}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
            >
              <Main posts={posts} showAll={true} />
            </motion.div>

            {/* Pagination — real links so crawlers can walk every page */}
            {totalPages > 1 && (
              <nav aria-label="Blog pages" className="flex justify-center items-center gap-3 pt-12 border-t border-white/10">
                {currentPage === 1 ? (
                  <span className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm opacity-20 select-none">
                    Prev
                  </span>
                ) : (
                  <Link
                    href={pageHref(currentPage - 1)}
                    rel="prev"
                    className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm transition hover:bg-white/10"
                  >
                    Prev
                  </Link>
                )}

                <div className="flex gap-1.5 items-center">
                  {getVisiblePages(currentPage, totalPages).map((num, i) =>
                    num === "…" ? (
                      <span key={`ellipsis-${i}`} className="h-10 w-8 flex items-center justify-center text-sm text-slate-500 select-none">…</span>
                    ) : num === currentPage ? (
                      <span
                        key={num}
                        aria-current="page"
                        className="h-10 w-10 rounded-xl border border-brand bg-brand/10 text-brandLight/80 flex items-center justify-center text-sm font-medium"
                      >
                        {num}
                      </span>
                    ) : (
                      <Link
                        key={num}
                        href={pageHref(num)}
                        className="h-10 w-10 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 text-slate-400 flex items-center justify-center text-sm font-medium transition"
                      >
                        {num}
                      </Link>
                    )
                  )}
                </div>

                {currentPage === totalPages ? (
                  <span className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm opacity-20 select-none">
                    Next
                  </span>
                ) : (
                  <Link
                    href={pageHref(currentPage + 1)}
                    rel="next"
                    className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm transition hover:bg-white/10"
                  >
                    Next
                  </Link>
                )}
              </nav>
            )}
          </div>
        ) : (
          <div className="rounded-3xl border border-white/10 bg-white/5 p-20 text-center backdrop-blur-xl">
            <p className="text-slate-400">No posts found.</p>
          </div>
        )}
      </div>
    </div>
  );
}
