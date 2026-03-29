"use client";

import React from "react";
import { motion } from "framer-motion";

export default function ModulePageShell({
  eyebrow = "IntelliTrade modules",
  title,
  description,
  actions = null,
  maxWidth = "max-w-[1880px]",
  children,
}) {
  return (
    <div className="min-h-screen bg-[#020203] px-6 pb-10 pt-36 text-white sm:px-8 lg:px-10">
      <div className={["mx-auto", maxWidth].join(" ")}>
        <div className="relative overflow-hidden rounded-[38px] border border-white/8 bg-[linear-gradient(180deg,rgba(10,10,14,0.88),rgba(4,4,7,0.96))] shadow-[0_30px_90px_rgba(0,0,0,0.42)] backdrop-blur-2xl">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.05),transparent_36%),radial-gradient(circle_at_88%_18%,rgba(139,92,246,0.07),transparent_18%)]" />
          <div className="pointer-events-none absolute inset-0 opacity-[0.08] [background-image:radial-gradient(rgba(255,255,255,0.06)_1px,transparent_1px)] [background-size:11px_11px]" />

          <div className="relative z-10 p-6 sm:p-8 lg:p-10">
            <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
              <div className="max-w-3xl">
                <div className="inline-flex items-center rounded-full border border-white/12 bg-white/[0.03] px-4 py-2 text-[11px] font-medium uppercase tracking-[0.28em] text-white/72">
                  {eyebrow}
                </div>
                <h1 className="mt-4 text-3xl font-semibold tracking-tight text-white sm:text-4xl">{title}</h1>
                {description ? (
                  <p className="mt-3 max-w-3xl text-sm leading-relaxed text-white/48 sm:text-base">{description}</p>
                ) : null}
              </div>

              {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
            </div>
          </div>
        </div>

        <motion.div initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.28 }} className="mt-6">
          {children}
        </motion.div>
      </div>
    </div>
  );
}