import { cn } from "@/lib/utils";

type BadgeProps = {
  children: React.ReactNode;
  tone?: "default" | "high" | "medium" | "low" | "sample";
};

export function Badge({ children, tone = "default" }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold uppercase tracking-[0.18em]",
        tone === "default" && "border-white/10 bg-white/6 text-muted",
        tone === "high" && "border-rose-400/30 bg-rose-400/12 text-rose-100",
        tone === "medium" &&
          "border-amber-300/30 bg-amber-300/12 text-amber-100",
        tone === "low" &&
          "border-emerald-400/30 bg-emerald-400/12 text-emerald-100",
        tone === "sample" && "border-cyan-300/30 bg-cyan-300/12 text-cyan-100"
      )}
    >
      {children}
    </span>
  );
}
