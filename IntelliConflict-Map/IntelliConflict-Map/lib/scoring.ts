import type { SeverityLabel } from "@/lib/schema";
import { clamp } from "@/lib/utils";

export const CATEGORY_DEFINITIONS = [
  {
    id: "airstrikes",
    label: "Airstrikes",
    keywords: [
      "airstrike",
      "air strike",
      "artillery",
      "shelling",
      "bombardment",
      "bombing"
    ]
  },
  {
    id: "ground-clashes",
    label: "Ground clashes",
    keywords: [
      "clash",
      "clashes",
      "battlefield",
      "incursion",
      "insurgent",
      "militia",
      "troops"
    ]
  },
  {
    id: "explosions",
    label: "Explosions",
    keywords: ["explosion", "blast", "attack", "suicide bombing"]
  },
  {
    id: "drones-missiles",
    label: "Drones/Missiles",
    keywords: ["drone", "missile", "rocket", "strike"]
  },
  {
    id: "diplomacy",
    label: "Diplomacy",
    keywords: ["ceasefire", "talks", "negotiation", "negotiations", "truce"]
  }
] as const;

export type CategoryId = (typeof CATEGORY_DEFINITIONS)[number]["id"];

const STRONG_KEYWORDS =
  /\b(airstrike|air strike|missile|bomb|bombing|artillery|shelling)\b/i;
const MODERATE_KEYWORDS = /\b(attack|explosion|strike|clashes?)\b/i;
const DEESCALATION_KEYWORDS =
  /\b(ceasefire|talks?|negotiation|negotiations|truce)\b/i;
const RECENCY_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;
const HOTSPOT_BASELINE_MAX = 50;

export function deriveTags(text: string) {
  const lowerText = text.toLowerCase();

  return CATEGORY_DEFINITIONS.filter(({ keywords }) =>
    keywords.some((keyword) => lowerText.includes(keyword))
  ).map(({ label }) => label);
}

export function severityLabelFromScore(score: number): SeverityLabel {
  if (score >= 67) {
    return "High";
  }

  if (score >= 34) {
    return "Medium";
  }

  return "Low";
}

export function getRecencyBoost(input: {
  dateIso: string;
  maxBoost?: number;
  now?: Date;
}) {
  const now = input.now ?? new Date();
  const ageMs = Math.max(now.getTime() - new Date(input.dateIso).getTime(), 0);

  return Math.round(
    clamp(1 - ageMs / RECENCY_WINDOW_MS, 0, 1) * (input.maxBoost ?? 20)
  );
}

export function scoreSeverity(input: {
  title: string;
  dateIso: string;
  gdeltTone?: number;
  now?: Date;
}) {
  const now = input.now ?? new Date();
  const title = input.title.toLowerCase();
  let score = 0;

  if (STRONG_KEYWORDS.test(title)) {
    score += 25;
  }

  if (MODERATE_KEYWORDS.test(title)) {
    score += 15;
  }

  if (DEESCALATION_KEYWORDS.test(title)) {
    score -= 10;
  }

  score += getRecencyBoost({
    dateIso: input.dateIso,
    now,
    maxBoost: 20
  });

  if (typeof input.gdeltTone === "number" && input.gdeltTone < 0) {
    score += clamp(Math.abs(input.gdeltTone) / 10, 0, 10);
  }

  const severityScore = Math.round(clamp(score, 0, 100));

  return {
    severityScore,
    severityLabel: severityLabelFromScore(severityScore)
  };
}

export function scoreHotspotSeverity(input: {
  hotspotCount: number;
  gdeltTone?: number;
  maxHotspotCount?: number;
  recencyBoost?: number;
}) {
  const hotspotCount = Math.max(
    1,
    typeof input.hotspotCount === "number" && Number.isFinite(input.hotspotCount)
      ? input.hotspotCount
      : 1
  );
  const maxHotspotCount =
    typeof input.maxHotspotCount === "number" &&
    Number.isFinite(input.maxHotspotCount)
      ? input.maxHotspotCount
      : 0;
  const denominator = Math.log1p(
    maxHotspotCount > 1 ? maxHotspotCount : HOTSPOT_BASELINE_MAX
  );
  const intensity = clamp(Math.log1p(hotspotCount) / denominator, 0, 1);

  let score = intensity * 80;

  if (typeof input.gdeltTone === "number" && input.gdeltTone < 0) {
    score += clamp(Math.abs(input.gdeltTone) / 4, 0, 15);
  }

  score += input.recencyBoost ?? 0;

  const severityScore = Math.round(clamp(score, 0, 100));

  return {
    severityScore,
    severityLabel: severityLabelFromScore(severityScore)
  };
}
