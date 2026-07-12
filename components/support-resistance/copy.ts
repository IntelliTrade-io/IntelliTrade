export const supportResistanceCopy = {
  disclaimer:
    "Research-backed ranges are based on historical testing and are for educational decision support only. They are not trading signals, financial advice, or guarantees of future results.",
  emptyStates: {
    // Rows/zones can exist while none are Green+; wording must never imply "no data" then.
    noGreenPlus: "No Green+ opportunities right now.",
    noReclaim: "No active reclaim opportunity right now.",
    noZones: "No active EURUSD support zones right now.",
    blueZones:
      "Informational zones are support zones without a validated historical edge. They are not trade-ready by themselves.",
    roadmap: "More pairs and resistance zones coming later. Alpha v1 is limited to EURUSD M15 support zones.",
  },
  tooltips: {
    staticVsDynamic:
      "Static strength measures the underlying support shelf itself. Dynamic grade measures the current reclaim context around that shelf. They should not be read as the same input.",
    blueZones:
      "Informational means a basic support zone has been identified, but no validated historical edge or qualified opportunity is attached to it. It is the neutral baseline, not a negative setup.",
    watchBlocked:
      "Watch means the setup is below the activation threshold — potential context is present, but it has not qualified yet. Blocked means one or more required model conditions were not met.",
    aPlusMeaning:
      "A+ is the highest grade tier: 86.57% of comparable resolved historical setups reached the model's 0.50R reaction target. Short-term first reaction, not a reversal call.",
    notSignal:
      "This module is educational research context. It summarizes historical EURUSD support-only reaction rates and related filters, not execution instructions.",
  },
  scopeNotes: [
    "Alpha v1 scope: EURUSD only.",
    "Zone scope: support only; resistance is out of scope.",
    "Context model: M15 close-reclaim research filter.",
    "Short-term first reaction focus around 0.50R.",
    "Research stop buffer reference: 0.30 ATR.",
    "Late-session conditions are excluded from the Alpha context.",
  ],
  developerNotes: [
    "Replace mock zone arrays with Supabase rows at the SupportResistanceAlphaModule boundary.",
    "Keep asset_id and provider_alias authoritative, then map pair labels for display only.",
    "The current reaction_range_low and reaction_range_high fields are structured for direct sr_opportunities mapping.",
  ],
} as const;

/**
 * Shared tooltip template for any surface that shows a historical reaction
 * rate. Never phrase the rate as a probability for the current live zone.
 */
export function reactionRateTooltip(rate: number): string {
  return `${rate.toFixed(2)}% of comparable resolved historical setups reached the model's 0.50R reaction target. Historical results do not guarantee future performance.`;
}
