"use client";

import React from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// ShellTexture
// ---------------------------------------------------------------------------

interface ShellTextureProps {
  brand?: boolean;
}

export function ShellTexture({ brand = false }: ShellTextureProps) {
  return (
    <>
      <div className="pointer-events-none absolute inset-0 opacity-[0.12] [background-image:radial-gradient(rgba(255,255,255,0.05)_1px,transparent_1px)] [background-size:10px_10px]" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.04),transparent_34%),linear-gradient(180deg,rgba(255,255,255,0.02),transparent_42%)]" />
      {brand ? (
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_88%_10%,rgba(139,92,246,0.05),transparent_18%)]" />
      ) : null}
    </>
  );
}

// ---------------------------------------------------------------------------
// SoftLines
// ---------------------------------------------------------------------------

const SOFT_LINES = [
  { left: "9%", top: "14%", width: 130, rotate: 16 },
  { left: "81%", top: "10%", width: 90, rotate: -12 },
  { left: "76%", top: "84%", width: 110, rotate: 11 },
] as const;

export function SoftLines() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden opacity-20">
      {SOFT_LINES.map((line, i) => (
        <div
          key={i}
          className="absolute"
          style={{
            left: line.left,
            top: line.top,
            transform: `rotate(${line.rotate}deg)`,
          }}
        >
          <div
            className="relative h-px bg-gradient-to-r from-white/5 via-white/18 to-white/5"
            style={{ width: line.width }}
          >
            <span className="absolute -left-1 -top-1 h-2 w-2 rounded-full bg-white/35 blur-[1px]" />
            <span className="absolute -right-1 -top-1 h-2 w-2 rounded-full bg-white/25 blur-[1px]" />
          </div>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// WidgetShell
// ---------------------------------------------------------------------------

interface WidgetShellProps {
  title: string;
  tone?: "neutral" | "brand";
  headerRight?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  contentClassName?: string;
}

export function WidgetShell({
  title,
  tone = "neutral",
  headerRight,
  children,
  className = "",
  contentClassName = "",
}: WidgetShellProps) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className={cn(
        "relative flex h-full min-h-0 flex-col overflow-hidden rounded-[32px] border border-white/10 bg-[linear-gradient(180deg,rgba(12,12,16,0.96),rgba(7,7,10,0.96))] shadow-[0_0_0_1px_rgba(255,255,255,0.04),0_28px_72px_rgba(0,0,0,0.44)] backdrop-blur-2xl",
        className,
      )}
    >
      <SoftLines />
      <ShellTexture brand={tone === "brand"} />
      <div className="relative z-10 flex h-full min-h-0 flex-col p-5 sm:p-6">
        <div className="flex flex-col gap-4 border-b border-white/8 pb-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0">
            <h2 className="text-2xl font-semibold tracking-tight text-white">
              {title}
            </h2>
          </div>
          {headerRight ? (
            <div className="flex shrink-0 flex-wrap items-center gap-2">
              {headerRight}
            </div>
          ) : null}
        </div>
        <div className={cn("mt-4 flex-1 min-h-0", contentClassName)}>
          {children}
        </div>
      </div>
    </motion.section>
  );
}
