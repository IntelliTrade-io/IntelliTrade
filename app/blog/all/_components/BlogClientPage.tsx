"use client";

import { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
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

function getVisiblePages(current: number, total: number): (number | "…")[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const pages: (number | "…")[] = [1];
  if (current > 3) pages.push("…");
  for (let i = Math.max(2, current - 1); i <= Math.min(total - 1, current + 1); i++) pages.push(i);
  if (current < total - 2) pages.push("…");
  pages.push(total);
  return pages;
}

export default function BlogClientPage({ initialPosts }: { initialPosts: Post[] }) {
  const [currentPage, setCurrentPage] = useState(1);
  const postsPerPage = 6;

  const totalPages = Math.ceil(initialPosts.length / postsPerPage);
  
  const currentPosts = useMemo(() => {
    const start = (currentPage - 1) * postsPerPage;
    return initialPosts.slice(start, start + postsPerPage);
  }, [currentPage, initialPosts]);

  const paginate = (num: number) => {
    setCurrentPage(num);
    // Smooth scroll to top when changing pages
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

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
        </header>

        {initialPosts.length > 0 ? (
          <div className="space-y-12">
            <AnimatePresence mode="wait">
              <motion.div 
                key={currentPage}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.3 }}
              >
                {/* Main will now receive the image property within currentPosts */}
                <Main posts={currentPosts} showAll={true} />
              </motion.div>
            </AnimatePresence>

            {/* Pagination Controls */}
            {totalPages > 1 && (
              <div className="flex justify-center items-center gap-3 pt-12 border-t border-white/10">
                <button
                  onClick={() => paginate(Math.max(1, currentPage - 1))}
                  disabled={currentPage === 1}
                  className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm transition hover:bg-white/10 disabled:opacity-20"
                >
                  Prev
                </button>
                
                <div className="flex gap-1.5 items-center">
                  {getVisiblePages(currentPage, totalPages).map((num, i) =>
                    num === "…" ? (
                      <span key={`ellipsis-${i}`} className="h-10 w-8 flex items-center justify-center text-sm text-slate-500 select-none">…</span>
                    ) : (
                      <button
                        key={num}
                        onClick={() => paginate(num)}
                        className={`h-10 w-10 rounded-xl border transition text-sm font-medium ${
                          currentPage === num
                            ? "border-brand bg-brand/10 text-brandLight/80"
                            : "border-white/10 bg-white/5 hover:bg-white/10 text-slate-400"
                        }`}
                      >
                        {num}
                      </button>
                    )
                  )}
                </div>

                <button
                  onClick={() => paginate(Math.min(totalPages, currentPage + 1))}
                  disabled={currentPage === totalPages}
                  className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm transition hover:bg-white/10 disabled:opacity-20"
                >
                  Next
                </button>
              </div>
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