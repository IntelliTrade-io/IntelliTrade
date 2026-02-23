"use client";

import { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Main from "@/app/blog/Main";

interface Post {
  slug: string;
  date: string;
  title: string;
  summary: string;
  tags: string[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  image?: any; // <--- Add this line to the interface
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
    <div className="relative min-h-screen bg-black text-slate-100 pb-20">
      <div className="relative z-10 w-full max-w-5xl px-6 pt-20">
        <header className="mb-16 text-center">
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
                
                <div className="flex gap-2">
                  {Array.from({ length: totalPages }, (_, i) => i + 1).map((num) => (
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
                  ))}
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