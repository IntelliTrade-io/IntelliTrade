"use client";

import * as React from "react";

import { cn } from "@/lib/utils";

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  size?: "sm" | "md";
  variant?: "primary" | "secondary" | "ghost";
};

export function Button({
  children,
  className,
  size = "md",
  type = "button",
  variant = "secondary",
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={cn(
        "focus-ring inline-flex items-center justify-center rounded-xl border text-sm font-semibold transition-all duration-200 disabled:cursor-not-allowed disabled:opacity-50",
        size === "sm" ? "h-9 px-3.5" : "h-11 px-4",
        variant === "primary" &&
          "border-accent/30 bg-accent/16 text-white hover:-translate-y-0.5 hover:bg-accent/22",
        variant === "secondary" &&
          "border-white/10 bg-white/6 text-text hover:-translate-y-0.5 hover:border-white/16 hover:bg-white/10",
        variant === "ghost" &&
          "border-transparent bg-transparent text-muted hover:bg-white/6 hover:text-white",
        className
      )}
      {...props}
    >
      {children}
    </button>
  );
}
