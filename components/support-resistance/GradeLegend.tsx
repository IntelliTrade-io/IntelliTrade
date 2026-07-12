import React from "react";
import {
  GRADE_DISPLAY_ORDER,
  HISTORICAL_REACTION_RATE,
  dynamicOpportunityGradeConfig,
  formatHistoricalReactionRate,
  gradeBadgeStyle,
  gradeSummaryLine,
} from "./gradeConfig";
import { reactionRateTooltip } from "./copy";
import EducationalTooltip from "./EducationalTooltip";

interface GradeLegendProps {
  compact?: boolean;
  /** Wider cards get the precise 0.50R wording + a supporting line. */
  precise?: boolean;
}

/**
 * The one grade legend. Renders every opportunity grade in the user-facing
 * rank order (A+ → Elite Green → Green → Watch → Informational → Blocked) with
 * its exact historical reaction rate or qualification status. DOM order IS the
 * rank order — screen readers and visual layout agree.
 */
export function GradeLegend({ compact = false, precise = false }: GradeLegendProps) {
  return (
    <ul
      aria-label="Opportunity grade legend, ranked highest to lowest"
      className={[
        "grid gap-2",
        compact ? "grid-cols-2 sm:grid-cols-3" : "grid-cols-2 sm:grid-cols-3 xl:grid-cols-6",
      ].join(" ")}
    >
      {GRADE_DISPLAY_ORDER.map((grade) => {
        const config = dynamicOpportunityGradeConfig[grade];
        const rate = HISTORICAL_REACTION_RATE[grade];

        return (
          <li
            key={grade}
            className="flex flex-col gap-1.5 rounded-2xl border border-white/10 bg-white/[0.03] px-3 py-2.5"
          >
            <div className="flex items-center justify-between gap-2">
              <span
                className="inline-flex items-center rounded-full border px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.16em]"
                style={gradeBadgeStyle(grade)}
              >
                {config.label}
              </span>
              {rate !== undefined ? (
                <EducationalTooltip label={reactionRateTooltip(rate)} align="right" />
              ) : null}
            </div>
            <div className={compact ? "text-xs text-white/72" : "text-[13px] text-white/78"}>
              {rate !== undefined ? (
                <>
                  <span className="font-semibold text-white">{formatHistoricalReactionRate(grade)}</span>{" "}
                  {precise ? "historical 0.50R reaction rate" : "historical reaction rate"}
                </>
              ) : (
                gradeSummaryLine(grade)
              )}
            </div>
            {precise ? (
              <div className="text-[11px] leading-snug text-white/40">
                {rate !== undefined ? "Based on comparable resolved setups" : config.description}
              </div>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

export default GradeLegend;
