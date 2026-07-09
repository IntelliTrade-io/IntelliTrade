"use client";

import React from "react";
import { motion } from "framer-motion";

interface ModulePageShellProps {
  eyebrow?: string;
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  maxWidth?: string;
  children: React.ReactNode;
}

export default function ModulePageShell({
  eyebrow = "IntelliTrade modules",
  title,
  description,
  actions = null,
  maxWidth = "max-w-[1880px]",
  children,
}: ModulePageShellProps) {
  return (
    <div className="min-h-screen bg-[#020203] px-4 pb-6 pt-20 text-white sm:px-6 lg:px-8">
      <div className={["mx-auto", maxWidth].join(" ")}>
        <div className="relative overflow-hidden rounded-[22px] border border-white/8 bg-[linear-gradient(180deg,rgba(10,10,14,0.88),rgba(4,4,7,0.96))] shadow-[0_20px_60px_rgba(0,0,0,0.4)] backdrop-blur-2xl">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.05),transparent_36%),radial-gradient(circle_at_88%_18%,rgba(139,92,246,0.07),transparent_18%)]" />
          <div className="pointer-events-none absolute inset-0 opacity-[0.08] [background-image:radial-gradient(rgba(255,255,255,0.06)_1px,transparent_1px)] [background-size:11px_11px]" />

          <div className="relative z-10 px-4 py-3.5 sm:px-5">
            <div className="flex flex-col gap-2 xl:flex-row xl:items-center xl:justify-between">
              <div className="max-w-3xl">
                <div className="inline-flex items-center rounded-full border border-white/12 bg-white/[0.03] px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.24em] text-white/64">
                  {eyebrow}
                </div>
                <h1 className="mt-1.5 text-xl font-semibold tracking-tight text-white sm:text-2xl">{title}</h1>
                {description ? (
                  <p className="mt-1 max-w-3xl text-xs leading-relaxed text-white/44 sm:text-sm">{description}</p>
                ) : null}
              </div>

              {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
            </div>
          </div>
        </div>

        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.24 }} className="mt-3">
          {children}
        </motion.div>
      </div>
    </div>
  );
}