import React, { useId, useState } from "react";
import { Info } from "lucide-react";

interface EducationalTooltipProps {
  label: string;
  align?: "left" | "right";
}

export function EducationalTooltip({ label, align = "left" }: EducationalTooltipProps) {
  const [open, setOpen] = useState(false);
  const descriptionId = useId();

  return (
    <span
      className="relative inline-flex"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
          setOpen(false);
        }
      }}
    >
      <button
        type="button"
        aria-describedby={open ? descriptionId : undefined}
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        className="relative inline-flex h-7 w-7 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-white/56 transition-all after:absolute after:-inset-2 after:content-[''] hover:border-white/18 hover:text-white motion-reduce:transition-none"
      >
        <Info className="h-3.5 w-3.5" />
      </button>

      {open ? (
        <span
          id={descriptionId}
          role="tooltip"
          className={[
            "absolute top-[calc(100%+0.55rem)] z-20 w-72 rounded-[18px] border border-white/12 bg-[linear-gradient(180deg,rgba(18,18,24,0.96),rgba(10,10,15,0.98))] px-4 py-3 text-left text-xs leading-relaxed text-white/70 shadow-[0_24px_60px_rgba(0,0,0,0.38)] backdrop-blur-2xl",
            align === "right" ? "right-0" : "left-0",
          ].join(" ")}
        >
          {label}
        </span>
      ) : null}
    </span>
  );
}

export default EducationalTooltip;
