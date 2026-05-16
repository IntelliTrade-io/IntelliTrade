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

// High-severity conflict indicators — any match gives a significant boost
const HIGH_SEVERITY_TERMS =
  /\b(missile|airstrike|air strike|drone strike|shelling|artillery|bombing|explosion|incursion|ambush|mass casualty|cross-border strike|rocket fire|offensive|bombardment|barrage|blitz|mortar|grenade|raid)\b/i;

// Strong conflict indicators — clear violence but not the most extreme
const STRONG_KEYWORDS =
  /\b(attack|attacked|bomb|bombed|kill|kills|killed|casualties|wounded|dead|deaths|fighting|fighters|gunfire|gunshot|shot|shooting|strike)\b/i;

// Moderate conflict indicators
const MODERATE_KEYWORDS =
  /\b(clashes?|clash|troops|militia|armed|forces|soldiers|siege|capture|offensive|frontline|battle)\b/i;

// Dampening — de-escalation or non-violent news signals
const DEESCALATION_KEYWORDS =
  /\b(ceasefire|talks?|negotiation|negotiations|truce|diplomacy|diplomatic|summit|agreement|statement|delegation|discussion|peace talks?)\b/i;

// Hotspot-level severe override: if any of these appear in hotspot headlines, minimum Medium
const HOTSPOT_OVERRIDE_TERMS =
  /\b(missile|airstrike|air strike|drone strike|shelling|artillery|bombing|explosion|rocket|incursion|mass casualty|cross-border|raid|mortar|barrage)\b/i;

const RECENCY_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;
const HOTSPOT_BASELINE_MAX = 50;

export type SeverityReasons = string[];

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
  const reasons: SeverityReasons = [];

  if (HIGH_SEVERITY_TERMS.test(title)) {
    score += 40;
    const match = title.match(HIGH_SEVERITY_TERMS)?.[0];
    reasons.push(`Contains severe term: ${match ?? "conflict indicator"}`);
  }

  if (STRONG_KEYWORDS.test(title)) {
    score += 20;
    reasons.push("Strong violence indicator");
  }

  if (MODERATE_KEYWORDS.test(title)) {
    score += 12;
    reasons.push("Moderate conflict indicator");
  }

  if (DEESCALATION_KEYWORDS.test(title)) {
    score -= 15;
    reasons.push("Diplomacy term lowered severity");
  }

  const recencyBoost = getRecencyBoost({ dateIso: input.dateIso, now, maxBoost: 20 });
  if (recencyBoost > 0) {
    score += recencyBoost;
    if (recencyBoost >= 15) {
      reasons.push("Recent event boost applied");
    }
  }

  if (typeof input.gdeltTone === "number" && input.gdeltTone < 0) {
    const toneBoost = clamp(Math.abs(input.gdeltTone) / 8, 0, 15);
    score += toneBoost;
    if (toneBoost >= 8) {
      reasons.push("Negative tone increased risk score");
    }
  }

  const severityScore = Math.round(clamp(score, 0, 100));

  return {
    severityScore,
    severityLabel: severityLabelFromScore(severityScore),
    severityReasons: reasons
  };
}

export function scoreHotspotSeverity(input: {
  hotspotCount: number;
  gdeltTone?: number;
  maxHotspotCount?: number;
  recencyBoost?: number;
  headlineText?: string;
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
  const reasons: SeverityReasons = [];

  if (intensity >= 0.85) {
    reasons.push("High hotspot intensity");
  } else if (intensity >= 0.5) {
    reasons.push("Moderate hotspot intensity");
  }

  if (typeof input.gdeltTone === "number" && input.gdeltTone < 0) {
    const toneBoost = clamp(Math.abs(input.gdeltTone) / 4, 0, 15);
    score += toneBoost;
    if (toneBoost >= 8) {
      reasons.push("Negative tone boost applied");
    }
  }

  score += input.recencyBoost ?? 0;

  // Keyword boost from representative headline text
  if (input.headlineText) {
    if (HOTSPOT_OVERRIDE_TERMS.test(input.headlineText)) {
      const match = input.headlineText.match(HOTSPOT_OVERRIDE_TERMS)?.[0];
      reasons.push(`Representative headline contains severe term: ${match ?? "conflict indicator"}`);

      // If severe term found and count is meaningful, ensure at least Medium
      if (hotspotCount >= 3) {
        score = Math.max(score, 40);
      } else {
        score = Math.max(score, 34);
      }

      // Additional boost for clear high-severity content
      score += 12;
    } else if (STRONG_KEYWORDS.test(input.headlineText)) {
      score += 6;
      reasons.push("Strong conflict indicator in headline");
    }
  }

  const severityScore = Math.round(clamp(score, 0, 100));

  return {
    severityScore,
    severityLabel: severityLabelFromScore(severityScore),
    severityReasons: reasons
  };
}
