"use client";

import type * as React from "react";

import { cn } from "@/lib/utils";

type InputProps = React.InputHTMLAttributes<HTMLInputElement>;

export function Input({ className, ...props }: InputProps) {
  return (
    <input
      className={cn(
        "focus-ring h-11 w-full rounded-2xl border border-white/10 bg-white/6 px-4 text-sm text-white placeholder:text-muted/80",
        className
      )}
      {...props}
    />
  );
}
