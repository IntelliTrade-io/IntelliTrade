"use client";

import { cn } from "@/lib/utils";

type ChipProps = {
  active?: boolean;
  children: React.ReactNode;
  onClick?: () => void;
};

export function Chip({ active = false, children, onClick }: ChipProps) {
  const className = cn(
    "rounded-full border px-3 py-1.5 text-sm transition-all duration-200",
    active
      ? "border-accent/30 bg-accent/14 text-white shadow-[0_0_22px_rgba(140,103,255,0.16)]"
      : "border-white/10 bg-white/5 text-muted hover:border-white/16 hover:bg-white/8 hover:text-white"
  );

  if (!onClick) {
    return <span className={className}>{children}</span>;
  }

  return (
    <button
      type="button"
      className={cn("focus-ring", className)}
      onClick={onClick}
    >
      {children}
    </button>
  );
}
