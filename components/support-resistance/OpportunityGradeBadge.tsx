import React from "react";
import { dynamicOpportunityGradeConfig, gradeBadgeStyle } from "./gradeConfig";
import type { DynamicOpportunityGrade } from "./types";

interface OpportunityGradeBadgeProps {
  grade: DynamicOpportunityGrade;
  compact?: boolean;
}

export function OpportunityGradeBadge({ grade, compact = false }: OpportunityGradeBadgeProps) {
  const config = dynamicOpportunityGradeConfig[grade];

  return (
    <span
      className={[
        "inline-flex items-center rounded-full border font-semibold uppercase tracking-[0.18em]",
        compact ? "px-2.5 py-1 text-[10px]" : "px-3 py-1.5 text-[11px]",
      ].join(" ")}
      style={gradeBadgeStyle(grade)}
      aria-label={`Dynamic opportunity grade: ${config.label}`}
    >
      {config.label}
    </span>
  );
}

export default OpportunityGradeBadge;
