export const supportResistanceCopy = {
  disclaimer:
    "Research-backed ranges are based on historical testing and are for educational decision support only. They are not trading signals, financial advice, or guarantees of future results.",
  emptyStates: {
    // Rows/zones can exist while none are Green+; wording must never imply "no data" then.
    noGreenPlus: "No Green+ opportunities right now.",
    noReclaim: "No active reclaim opportunity right now.",
    noZones: "No active EURUSD support zones right now.",
    blueZones: "Blue zones are informational. They are not trade-ready by themselves.",
    roadmap: "More pairs and resistance zones coming later. Alpha v1 is limited to EURUSD M15 support zones.",
  },
  tooltips: {
    staticVsDynamic:
      "Static strength measures the underlying support shelf itself. Dynamic grade measures the current reclaim context around that shelf. They should not be read as the same input.",
    blueZones: "Informational. Not trade-ready by itself.",
    watchBlocked:
      "Watch means caution and quality is not clean enough yet. Blocked means poor context and should be avoided.",
    aPlusMeaning:
      "Short-term first reaction, not reversal call.",
    notSignal:
      "This module is educational research context. It summarizes historical EURUSD support-only reaction ranges and related filters, not execution instructions.",
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
