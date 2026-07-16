// Public projection for Entry Assist — the boundary where server-only research
// state collapses into the safe customer DTO. Reasons come from a fixed
// whitelist ONLY; nothing else (variant names, thresholds, confirm counts, stats,
// TP/SL, tiers, flags, DEAD_OTHER) may ever appear in the serialized output.

import type { PublicEntryAssistCandidate } from "@/types/domain/entry-assist";
import type { EvaluatedCandidate } from "./evaluator";

export const REASON_WHITELIST = [
  "Momentum aligned",
  "Gap healthy",
  "Gap weakening",
  "Confirmation developing",
  "Pair alignment active",
  "Momentum easing",
  "Strong momentum confirmation", // STRICT-variant Confirmed only
] as const;

const WHITELIST_SET = new Set<string>(REASON_WHITELIST);

function reasonsFor(candidate: EvaluatedCandidate): string[] {
  switch (candidate.state) {
    case "watching":
      return ["Momentum aligned", "Confirmation developing", "Pair alignment active"];
    case "confirmed":
      return candidate.variantIsStrict
        ? ["Momentum aligned", "Gap healthy", "Pair alignment active", "Strong momentum confirmation"]
        : ["Momentum aligned", "Gap healthy", "Pair alignment active"];
    case "fading":
      return ["Momentum easing", "Gap weakening"];
    default:
      return [];
  }
}

export function toPublicCandidate(candidate: EvaluatedCandidate): PublicEntryAssistCandidate {
  return {
    id: candidate.ruleId,
    symbol: `${candidate.baseCode}/${candidate.quoteCode}`,
    baseCode: candidate.baseCode,
    quoteCode: candidate.quoteCode,
    direction: candidate.direction,
    state: candidate.state,
    sessionLabel: candidate.sessionLabel,
    // Whitelist filter is belt-and-suspenders: reasonsFor already emits only
    // approved phrases, but nothing unapproved can slip through here either.
    reasons: reasonsFor(candidate).filter((r) => WHITELIST_SET.has(r)),
    updatedAt: candidate.updatedAt,
  };
}

const STATE_RANK: Record<PublicEntryAssistCandidate["state"], number> = {
  confirmed: 0,
  watching: 1,
  fading: 2,
};

/** Sort Confirmed > Watching > Fading, then alphabetical by symbol. */
export function compareCandidates(
  a: PublicEntryAssistCandidate,
  b: PublicEntryAssistCandidate,
): number {
  const byState = STATE_RANK[a.state] - STATE_RANK[b.state];
  return byState !== 0 ? byState : a.symbol.localeCompare(b.symbol);
}
