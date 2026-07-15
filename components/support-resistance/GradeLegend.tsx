import React from "react";
import {
  GRADE_COHORTS,
  GRADE_DISPLAY_ORDER,
  HISTORICAL_REACTION_RATE,
  dynamicOpportunityGradeConfig,
  formatHistoricalReactionRate,
  gradeBadgeStyle,
  gradeSummaryLine,
} from "./gradeConfig";
import { cohortRateTooltip } from "./copy";
import EducationalTooltip from "./EducationalTooltip";

interface GradeLegendProps {
  compact?: boolean;
  /** Wider cards get the precise 0.50R wording + a supporting line. */
  precise?: boolean;
}

/**
 * The one grade legend. Renders every opportunity grade in the teaching order
 * (ascending: Blocked → Informational → Watch → Green → Elite Green → A+) with
 * its cumulative-cohort historical rate or qualification status. DOM order IS
 * the teaching order — screen readers and visual layout agree.
 */
export function GradeLegend({ compact = false, precise = false }: GradeLegendProps) {
  return (
    <ul
      aria-label="Opportunity grade legend, from lowest to highest tier"
      className={[
        "grid gap-2",
        compact ? "grid-cols-2 sm:grid-cols-3" : "grid-cols-2 sm:grid-cols-3 xl:grid-cols-6",
      ].join(" ")}
    >
      {GRADE_DISPLAY_ORDER.map((grade) => {
        const config = dynamicOpportunityGradeConfig[grade];
        const rate = HISTORICAL_REACTION_RATE[grade];
        const cohort = GRADE_COHORTS[grade];

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
                <EducationalTooltip label={cohortRateTooltip(grade)} align="right" />
              ) : null}
            </div>
            <div className={compact ? "text-xs text-white/72" : "text-[13px] text-white/78"}>
              {rate !== undefined ? (
                <>
                  <span className="font-semibold text-white">{formatHistoricalReactionRate(grade)}</span>{" "}
                  {precise ? "historical 0.50R first-reaction rate" : "historical first-reaction rate"}
                </>
              ) : (
                gradeSummaryLine(grade)
              )}
            </div>
            {cohort ? (
              <div className="text-[11px] leading-snug text-white/40">
                {cohort.label} · {cohort.resolvedSample} resolved events
              </div>
            ) : precise ? (
              <div className="text-[11px] leading-snug text-white/40">{config.description}</div>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

export default GradeLegend;
