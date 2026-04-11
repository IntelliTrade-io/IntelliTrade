"use client";

import { cn } from "@/lib/utils";

type SegmentedOption<T extends string> = {
  label: string;
  value: T;
};

type SegmentedProps<T extends string> = {
  onChange: (value: T) => void;
  options: SegmentedOption<T>[];
  value: T;
};

export function Segmented<T extends string>({
  onChange,
  options,
  value
}: SegmentedProps<T>) {
  return (
    <div className="glass-panel flex rounded-2xl p-1">
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            className={cn(
              "focus-ring flex-1 rounded-xl px-3 py-2 text-sm font-semibold transition-all duration-200",
              active
                ? "bg-white/12 text-white shadow-[0_8px_24px_rgba(0,0,0,0.28)]"
                : "text-muted hover:text-white"
            )}
            onClick={() => onChange(option.value)}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
