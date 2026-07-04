import React from "react";
import { staticStrengthConfig } from "./gradeConfig";
import type { StaticZoneStrength } from "./types";

interface StaticStrengthMeterProps {
  strength: StaticZoneStrength;
  compact?: boolean;
}

export function StaticStrengthMeter({ strength, compact = false }: StaticStrengthMeterProps) {
  const config = staticStrengthConfig[strength];

  return (
    <div className="inline-flex items-center gap-3">
      <div className={["grid grid-cols-3 gap-1", compact ? "w-16" : "w-20"].join(" ")}>
        {Array.from({ length: 3 }).map((_, index) => {
          const active = index < config.meterIndex;
          return (
            <span
              key={index}
              className={[
                "h-2 rounded-full border border-white/10 bg-white/[0.06]",
                active ? `bg-gradient-to-r ${config.activeBarClassName}` : "",
              ].join(" ")}
            />
          );
        })}
      </div>
      <span className={compact ? "text-xs text-white/70" : "text-sm text-white/74"}>{config.label}</span>
    </div>
  );
}

export default StaticStrengthMeter;
