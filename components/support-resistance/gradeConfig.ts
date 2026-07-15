import type { DynamicOpportunityGrade, StaticZoneStrength } from "./types";

export const DYNAMIC_GRADE_ORDER: DynamicOpportunityGrade[] = [
  "blocked",
  "blue",
  "watch",
  "green",
  "elite_green",
  "a_plus",
];

/**
 * User-facing teaching order, ascending: Blocked → Informational → Watch →
 * Green → Elite Green → A+. Every legend, grade-card grid, dropdown and
 * explanation section renders lowest-to-highest (semantic DOM order, not CSS
 * reordering). Live row lists (scanner) still rank by current opportunity
 * quality, best first — that is ranking, not the teaching hierarchy.
 */
export const GRADE_DISPLAY_ORDER: DynamicOpportunityGrade[] = [...DYNAMIC_GRADE_ORDER];

/**
 * Validated historical 0.50R first-reaction rates per grade tier — the SINGLE
 * source for every promotional percentage. Exact values from the locked
 * validation run; never round them for display.
 *
 * IMPORTANT — these are CUMULATIVE cohorts, not exclusive per-grade rates:
 *   green       → Green+ cohort (Green, Elite Green and A+ combined)
 *   elite_green → Elite+ cohort (Elite Green and A+ combined)
 *   a_plus      → A+ cohort (A+ only)
 * Never present 81.94% as a Green-only rate or 84.40% as an Elite-Green-only
 * rate. Watch/Informational/Blocked carry no rate (not research-qualified).
 */
export const HISTORICAL_REACTION_RATE: Partial<Record<DynamicOpportunityGrade, number>> = {
  green: 81.94,
  elite_green: 84.4,
  a_plus: 86.57,
};

/**
 * Cumulative cohort metadata behind each rate: cohort name, which grades the
 * cohort includes, and the resolved sample size from the locked validation
 * run. Single source for cohort labels + sample sizes everywhere.
 */
export interface GradeCohort {
  label: string;
  includes: DynamicOpportunityGrade[];
  resolvedSample: number;
}

export const GRADE_COHORTS: Partial<Record<DynamicOpportunityGrade, GradeCohort>> = {
  green: { label: "Green+ cohort", includes: ["green", "elite_green", "a_plus"], resolvedSample: 155 },
  elite_green: { label: "Elite+ cohort", includes: ["elite_green", "a_plus"], resolvedSample: 109 },
  a_plus: { label: "A+ cohort", includes: ["a_plus"], resolvedSample: 67 },
};

export function formatHistoricalReactionRate(grade: DynamicOpportunityGrade): string | null {
  const rate = HISTORICAL_REACTION_RATE[grade];
  return rate === undefined ? null : `${rate.toFixed(2)}%`;
}

export const STATIC_STRENGTH_ORDER: StaticZoneStrength[] = ["weak", "medium", "strong"];

/**
 * Zone-band opacity by static strength: weak subdued, medium clearer, strong
 * brightest — one coherent hierarchy instead of six unrelated-looking boxes.
 */
export const STRENGTH_BAND_OPACITY: Record<StaticZoneStrength, number> = {
  weak: 0.45,
  medium: 0.7,
  strong: 0.95,
};

/**
 * SINGLE SOURCE OF TRUTH for grade colours — the locked semantic hierarchy:
 *   Blocked        crimson red      (conditions rejected)
 *   Informational  neutral slate    (structural information only)
 *   Watch          amber/orange     (caution, below qualification)
 *   Green          light green      (qualified)
 *   Elite Green    deep emerald     (high quality, restrained glow)
 *   A+             electric violet  (highest tier, restrained glow)
 * Every grade-coloured surface — badge pills, chart zone fill/border, scanner
 * rows, detail badges, legends, preview bands — derives from these tokens.
 * Do not hardcode grade colours anywhere else.
 *   text       – label / accent colour
 *   border     – zone / badge border (alpha-tuned)
 *   fill       – subtle zone / badge fill
 *   background – stronger card / badge background tint
 *   glow       – premium outer glow, ONLY for elite_green + a_plus
 */
export interface GradeTokens {
  text: string;
  border: string;
  fill: string;
  background: string;
  glow?: string;
}

export const GRADE_TOKENS: Record<DynamicOpportunityGrade, GradeTokens> = {
  blocked: {
    text: "#FB7185",
    border: "rgba(251, 113, 133, 0.72)",
    fill: "rgba(190, 24, 93, 0.16)",
    background: "rgba(127, 29, 29, 0.24)",
  },
  // "blue" is the legacy data key for the Informational grade (neutral slate).
  blue: {
    text: "#94A3B8",
    border: "rgba(148, 163, 184, 0.55)",
    fill: "rgba(100, 116, 139, 0.12)",
    background: "rgba(51, 65, 85, 0.22)",
  },
  watch: {
    text: "#F59E0B",
    border: "rgba(245, 158, 11, 0.72)",
    fill: "rgba(245, 158, 11, 0.14)",
    background: "rgba(120, 53, 15, 0.23)",
  },
  green: {
    text: "#86EFAC",
    border: "rgba(134, 239, 172, 0.72)",
    fill: "rgba(74, 222, 128, 0.14)",
    background: "rgba(20, 83, 45, 0.22)",
  },
  elite_green: {
    text: "#34D399",
    border: "rgba(5, 150, 105, 0.9)",
    fill: "rgba(4, 120, 87, 0.2)",
    background: "rgba(6, 78, 59, 0.28)",
    glow: "0 0 18px rgba(5, 150, 105, 0.28)",
  },
  a_plus: {
    text: "#A78BFA",
    border: "rgba(124, 58, 237, 0.95)",
    fill: "rgba(124, 58, 237, 0.2)",
    background: "rgba(76, 29, 149, 0.3)",
    glow: "0 0 22px rgba(124, 58, 237, 0.42)",
  },
};

export const dynamicOpportunityGradeConfig: Record<
  DynamicOpportunityGrade,
  {
    label: string;
    shortLabel: string;
    /** Uppercase chart/badge label, e.g. "ELITE GREEN". */
    compactLabel: string;
    description: string;
    tokens: GradeTokens;
    chartFill: string;
    chartStroke: string;
    glow: string;
    panelClassName: string;
    emphasisClassName: string;
    scannerStatus: string;
  }
> = {
  blue: {
    label: "Informational",
    shortLabel: "Info",
    compactLabel: "INFORMATIONAL",
    description: "Support zone only. No validated historical edge is currently attached to this zone.",
    tokens: GRADE_TOKENS.blue,
    chartFill: GRADE_TOKENS.blue.fill,
    chartStroke: GRADE_TOKENS.blue.border,
    glow: "",
    panelClassName: "border-slate-400/20 bg-slate-500/[0.08]",
    emphasisClassName: "text-slate-300",
    scannerStatus: "Informational",
  },
  watch: {
    label: "Watch",
    shortLabel: "Watch",
    compactLabel: "WATCH",
    description: "Below activation threshold. Potential context is present, but the setup is not yet qualified.",
    tokens: GRADE_TOKENS.watch,
    chartFill: GRADE_TOKENS.watch.fill,
    chartStroke: GRADE_TOKENS.watch.border,
    glow: "",
    panelClassName: "border-amber-400/22 bg-amber-500/[0.08]",
    emphasisClassName: "text-amber-200",
    scannerStatus: "Below threshold",
  },
  blocked: {
    label: "Blocked",
    shortLabel: "Blocked",
    compactLabel: "BLOCKED",
    description: "Conditions not qualified. One or more required model conditions were not met.",
    tokens: GRADE_TOKENS.blocked,
    chartFill: GRADE_TOKENS.blocked.fill,
    chartStroke: GRADE_TOKENS.blocked.border,
    glow: "",
    panelClassName: "border-rose-400/16 bg-rose-500/[0.06]",
    emphasisClassName: "text-rose-100",
    scannerStatus: "Not qualified",
  },
  green: {
    label: "Green",
    shortLabel: "Green",
    compactLabel: "GREEN",
    description:
      "Green+ cohort: 81.94% historical 0.50R first-reaction rate among resolved qualifying events (Green, Elite Green and A+ combined).",
    tokens: GRADE_TOKENS.green,
    chartFill: GRADE_TOKENS.green.fill,
    chartStroke: GRADE_TOKENS.green.border,
    glow: "",
    panelClassName: "border-green-300/18 bg-green-400/[0.06]",
    emphasisClassName: "text-green-100",
    scannerStatus: "Active review",
  },
  elite_green: {
    label: "Elite Green",
    shortLabel: "Elite",
    compactLabel: "ELITE GREEN",
    description:
      "Elite+ cohort: 84.40% historical 0.50R first-reaction rate among resolved qualifying events (Elite Green and A+ combined).",
    tokens: GRADE_TOKENS.elite_green,
    chartFill: GRADE_TOKENS.elite_green.fill,
    chartStroke: GRADE_TOKENS.elite_green.border,
    glow: GRADE_TOKENS.elite_green.glow ?? "",
    panelClassName: "border-emerald-400/20 bg-emerald-500/[0.07]",
    emphasisClassName: "text-emerald-200",
    scannerStatus: "Elite review",
  },
  a_plus: {
    label: "A+",
    shortLabel: "A+",
    compactLabel: "A+",
    description:
      "A+ cohort: 86.57% historical 0.50R first-reaction rate among resolved qualifying events. Short-term first reaction, not a reversal call.",
    tokens: GRADE_TOKENS.a_plus,
    chartFill: GRADE_TOKENS.a_plus.fill,
    chartStroke: GRADE_TOKENS.a_plus.border,
    glow: GRADE_TOKENS.a_plus.glow ?? "",
    panelClassName: "border-violet-400/22 bg-violet-500/[0.08]",
    emphasisClassName: "text-violet-200",
    scannerStatus: "A+ review",
  },
};

/**
 * Compact one-liner under a grade name in chips/legends/cards.
 * Qualified tiers get their exact historical rate; the rest get their
 * qualification status. `precise` adds the 0.50R target wording for
 * surfaces with room.
 */
export function gradeSummaryLine(grade: DynamicOpportunityGrade, precise = false): string {
  const rate = formatHistoricalReactionRate(grade);
  if (rate) {
    return precise ? `${rate} historical 0.50R first-reaction rate` : `${rate} historical reaction rate`;
  }
  if (grade === "watch") return "Below activation threshold";
  if (grade === "blue") return "Support zone only";
  return "Conditions not qualified";
}

/**
 * Inline style for any grade badge / pill. Single source — never hardcode grade
 * colours in a component. Spread into a `style={}` prop.
 */
export function gradeBadgeStyle(grade: DynamicOpportunityGrade): {
  color: string;
  borderColor: string;
  background: string;
  boxShadow?: string;
} {
  const t = GRADE_TOKENS[grade];
  return { color: t.text, borderColor: t.border, background: t.background, boxShadow: t.glow };
}

export const staticStrengthConfig: Record<
  StaticZoneStrength,
  {
    label: string;
    description: string;
    meterIndex: number;
    activeBarClassName: string;
  }
> = {
  weak: {
    label: "Weak",
    description: "Limited structural memory or lighter historical response quality.",
    meterIndex: 1,
    activeBarClassName: "from-rose-300/80 to-rose-400/40",
  },
  medium: {
    label: "Medium",
    description: "Established structural memory with moderate historical response quality.",
    meterIndex: 2,
    activeBarClassName: "from-amber-300/90 to-amber-500/40",
  },
  strong: {
    label: "Strong",
    description: "Stronger structural memory with more established historical response quality.",
    meterIndex: 3,
    activeBarClassName: "from-emerald-300/90 to-emerald-500/40",
  },
};
