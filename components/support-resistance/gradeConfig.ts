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

export const dynamicOpportunityGradeConfig: Record<
  DynamicOpportunityGrade,
  {
    label: string;
    shortLabel: string;
    description: string;
    badgeClassName: string;
    chartFill: string;
    chartStroke: string;
    panelClassName: string;
    emphasisClassName: string;
    scannerStatus: string;
  }
> = {
  blue: {
    label: "Blue",
    shortLabel: "Blue",
    description: "Informational. Not trade-ready by itself.",
    badgeClassName: "border-sky-400/22 bg-sky-400/10 text-sky-100",
    chartFill: "rgba(74, 183, 255, 0.14)",
    chartStroke: "#4AB7FF",
    panelClassName: "border-sky-400/18 bg-sky-500/[0.06]",
    emphasisClassName: "text-sky-200",
    scannerStatus: "Monitor only",
  },
  watch: {
    label: "Watch",
    shortLabel: "Watch",
    description: "Caution. Quality not clean enough yet.",
    badgeClassName: "border-amber-300/24 bg-amber-300/10 text-amber-100",
    chartFill: "rgba(251, 191, 36, 0.14)",
    chartStroke: "#F6C34E",
    panelClassName: "border-amber-300/16 bg-amber-400/[0.06]",
    emphasisClassName: "text-amber-100",
    scannerStatus: "Monitor only",
  },
  blocked: {
    label: "Blocked",
    shortLabel: "Blocked",
    description: "Poor context. Avoid prioritizing.",
    badgeClassName: "border-rose-400/24 bg-rose-400/10 text-rose-100",
    chartFill: "rgba(251, 113, 133, 0.14)",
    chartStroke: "#FB7185",
    panelClassName: "border-rose-400/16 bg-rose-500/[0.06]",
    emphasisClassName: "text-rose-100",
    scannerStatus: "Blocked",
  },
  green: {
    label: "Green",
    shortLabel: "Green",
    description: "Valid short-term reaction opportunity.",
    badgeClassName: "border-emerald-400/24 bg-emerald-400/10 text-emerald-100",
    chartFill: "rgba(52, 211, 153, 0.14)",
    chartStroke: "#34D399",
    panelClassName: "border-emerald-400/16 bg-emerald-500/[0.06]",
    emphasisClassName: "text-emerald-100",
    scannerStatus: "Active review",
  },
  elite_green: {
    label: "Elite Green",
    shortLabel: "Elite",
    description: "Higher-quality opportunity with stronger context.",
    badgeClassName: "border-teal-300/26 bg-teal-300/10 text-teal-100 shadow-[0_0_22px_rgba(45,212,191,0.16)]",
    chartFill: "rgba(45, 212, 191, 0.16)",
    chartStroke: "#2DD4BF",
    panelClassName: "border-teal-300/18 bg-teal-400/[0.06]",
    emphasisClassName: "text-teal-100",
    scannerStatus: "Elite review",
  },
  a_plus: {
    label: "A+",
    shortLabel: "A+",
    description: "Short-term first reaction, not reversal call.",
    badgeClassName:
      "border-[#F7E38C]/30 bg-[linear-gradient(135deg,rgba(201,255,229,0.12),rgba(247,227,140,0.14))] text-[#FFF1B1] shadow-[0_0_26px_rgba(247,227,140,0.18)]",
    chartFill: "rgba(247, 227, 140, 0.16)",
    chartStroke: "#F7E38C",
    panelClassName: "border-[#F7E38C]/18 bg-[#F7E38C]/[0.06]",
    emphasisClassName: "text-[#FFF1B1]",
    scannerStatus: "A+ review",
  },
};

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
