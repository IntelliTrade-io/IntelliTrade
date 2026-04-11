"use client";

import { cn } from "@/lib/utils";

type TooltipProps = {
  children: React.ReactNode;
  content: string;
};

export function Tooltip({ children, content }: TooltipProps) {
  return (
    <span className="group relative inline-flex">
      {children}
      <span
        className={cn(
          "pointer-events-none absolute right-0 top-full z-20 mt-2 min-w-max rounded-xl border border-white/10 bg-[#0d1322]/95 px-3 py-2 text-xs text-muted opacity-0 shadow-bloom transition-opacity duration-200 group-hover:opacity-100 group-focus-within:opacity-100"
        )}
      >
        {content}
      </span>
    </span>
  );
}
