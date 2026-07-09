import type { DynamicOpportunityGrade, StaticZoneStrength } from "./types";

export const DYNAMIC_GRADE_ORDER: DynamicOpportunityGrade[] = [
  "blocked",
  "blue",
  "watch",
  "green",
  "elite_green",
  "a_plus",
];

export const STATIC_STRENGTH_ORDER: StaticZoneStrength[] = ["weak", "medium", "strong"];

/**
 * SINGLE SOURCE OF TRUTH for grade colours. Every grade-coloured surface —
 * badge pills, chart zone fill/border, scanner badges, detail badges — derives
 * from these tokens. Do not hardcode grade colours anywhere else.
 *   text   – label / border accent colour
 *   border – zone / badge border (alpha-tuned)
 *   fill   – subtle zone / badge background
 *   glow   – premium outer glow, ONLY for elite_green + a_plus
 */
export interface GradeTokens {
  text: string;
  border: string;
  fill: string;
  glow?: string;
}

export const GRADE_TOKENS: Record<DynamicOpportunityGrade, GradeTokens> = {
  blocked: { text: "#f87171", border: "rgba(248, 113, 113, 0.55)", fill: "rgba(248, 113, 113, 0.12)" },
  // watch ↔ a_plus swapped (owner): watch = royal blue (no glow), a_plus = gold (glow).
  watch: { text: "#60a5fa", border: "rgba(65, 105, 225, 0.9)", fill: "rgba(65, 105, 225, 0.18)" },
  green: { text: "#22c55e", border: "rgba(34, 197, 94, 0.65)", fill: "rgba(22, 101, 52, 0.18)" },
  elite_green: {
    text: "#2dd4bf",
    border: "rgba(45, 212, 191, 0.85)",
    fill: "rgba(45, 212, 191, 0.16)",
    glow: "0 0 18px rgba(45, 212, 191, 0.35)",
  },
  a_plus: {
    text: "#facc15",
    border: "rgba(250, 204, 21, 0.65)",
    fill: "rgba(250, 204, 21, 0.14)",
    glow: "0 0 22px rgba(250, 204, 21, 0.45)",
  },
  // Legacy grade — the locked model never emits "blue"; kept for type completeness.
  blue: { text: "#7dd3fc", border: "rgba(56, 189, 248, 0.55)", fill: "rgba(56, 189, 248, 0.12)" },
};

export const dynamicOpportunityGradeConfig: Record<
  DynamicOpportunityGrade,
  {
    label: string;
    shortLabel: string;
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
    label: "Blue",
    shortLabel: "Blue",
    description: "Informational. Not trade-ready by itself.",
    tokens: GRADE_TOKENS.blue,
    chartFill: GRADE_TOKENS.blue.fill,
    chartStroke: GRADE_TOKENS.blue.border,
    glow: "",
    panelClassName: "border-sky-400/18 bg-sky-500/[0.06]",
    emphasisClassName: "text-sky-200",
    scannerStatus: "Monitor only",
  },
  watch: {
    label: "Watch",
    shortLabel: "Watch",
    description: "Caution. Quality not clean enough yet.",
    tokens: GRADE_TOKENS.watch,
    chartFill: GRADE_TOKENS.watch.fill,
    chartStroke: GRADE_TOKENS.watch.border,
    glow: "",
    panelClassName: "border-[#4169E1]/22 bg-[#4169E1]/[0.08]",
    emphasisClassName: "text-[#93b4ff]",
    scannerStatus: "Monitor only",
  },
  blocked: {
    label: "Blocked",
    shortLabel: "Blocked",
    description: "Poor context. Avoid prioritizing.",
    tokens: GRADE_TOKENS.blocked,
    chartFill: GRADE_TOKENS.blocked.fill,
    chartStroke: GRADE_TOKENS.blocked.border,
    glow: "",
    panelClassName: "border-rose-400/16 bg-rose-500/[0.06]",
    emphasisClassName: "text-rose-100",
    scannerStatus: "Blocked",
  },
  green: {
    label: "Green",
    shortLabel: "Green",
    description: "Valid short-term reaction opportunity.",
    tokens: GRADE_TOKENS.green,
    chartFill: GRADE_TOKENS.green.fill,
    chartStroke: GRADE_TOKENS.green.border,
    glow: "",
    panelClassName: "border-emerald-400/16 bg-emerald-500/[0.06]",
    emphasisClassName: "text-emerald-100",
    scannerStatus: "Active review",
  },
  elite_green: {
    label: "Elite Green",
    shortLabel: "Elite",
    description: "Higher-quality opportunity with stronger context.",
    tokens: GRADE_TOKENS.elite_green,
    chartFill: GRADE_TOKENS.elite_green.fill,
    chartStroke: GRADE_TOKENS.elite_green.border,
    glow: GRADE_TOKENS.elite_green.glow ?? "",
    panelClassName: "border-teal-300/18 bg-teal-400/[0.06]",
    emphasisClassName: "text-teal-100",
    scannerStatus: "Elite review",
  },
  a_plus: {
    label: "A+",
    shortLabel: "A+",
    description: "Short-term first reaction, not reversal call.",
    tokens: GRADE_TOKENS.a_plus,
    chartFill: GRADE_TOKENS.a_plus.fill,
    chartStroke: GRADE_TOKENS.a_plus.border,
    glow: GRADE_TOKENS.a_plus.glow ?? "",
    panelClassName: "border-amber-300/18 bg-amber-400/[0.06]",
    emphasisClassName: "text-amber-100",
    scannerStatus: "A+ review",
  },
};

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
  return { color: t.text, borderColor: t.border, background: t.fill, boxShadow: t.glow };
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
    description: "Thin structural memory with lighter historical response quality.",
    meterIndex: 1,
    activeBarClassName: "from-white/70 to-white/25",
  },
  medium: {
    label: "Medium",
    description: "Balanced structural memory with repeatable but not exceptional respect.",
    meterIndex: 2,
    activeBarClassName: "from-sky-300/90 to-sky-500/40",
  },
  strong: {
    label: "Strong",
    description: "Well-defended support shelf with stronger historical response behavior.",
    meterIndex: 3,
    activeBarClassName: "from-emerald-300/90 to-emerald-500/40",
  },
};
