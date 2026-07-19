// Centralized customer-facing copy for the CSM public reviews surface.
// Kept in one module so the copy-lint test can scan it for forbidden trading
// terms and em dashes (this product is analytics, not a signals service).
// Rule: no em dashes anywhere here, and none of the FORBIDDEN_REVIEW_TERMS.

export const REVIEW_EDUCATIONAL_NOTE =
  "This review evaluates historical currency-strength follow-through. It is not a buy or sell instruction.";

export const REVIEW_CTA_LABEL = "View today's live strength";

export const REVIEW_ARCHIVE_EMPTY =
  "Reviews publish only after their full evaluation window closes. The archive fills as cases complete.";

export const REVIEW_ARCHIVE_INTRO =
  "Each completed review looks back at a day when one currency read strongest and another weakest, then measures what the conventional pair did over the following weeks. Every qualifying case is published, positive or negative.";

export const REVIEW_CONVERSION_LEAD =
  "Public reviews are released only after the evaluation window closes.";

export const REVIEW_SUBTITLE = "What happened over the following two weeks?";

export const SCORECARD_LIMITATION =
  "A small number of completed cases is not conclusive evidence of anything. These figures describe measured follow-through over a limited observation window and will shift as more cases complete.";

export const MONTHLY_GROUPING_NOTE = "Grouped by capture month.";

export const OVERLAP_DISCLOSURE =
  "Some observations share a currency and are correlated, not independent.";

// Plain-language methodology sections (rendered on the methodology page).
export const METHODOLOGY_SECTIONS: { heading: string; body: string }[] = [
  {
    heading: "What the Daily reading measures",
    body: "The Daily currency-strength reading scores each of the eight major currencies from its trend behaviour across all pair combinations. A review starts from a day when the ranking put one currency clearly strongest and another clearly weakest, and the pair that expresses that difference was aligned in the same direction.",
  },
  {
    heading: "How a case qualifies",
    body: "A case opens only when the strongest and weakest currencies are far apart on the ladder, the conventional pair for them exists among the majors, the stored pair reading agrees with that direction, and the reading carries enough confidence. The same pair and direction cannot open a new case again until the reading has clearly reset first.",
  },
  {
    heading: "The evaluation windows",
    body: "From the last fully closed four-hour candle at capture, we count forward thirty four-hour bars for the short result and sixty for the long result. Weekends and market closures simply do not add bars. A review publishes only after all sixty forward bars have closed and been verified; nothing is estimated.",
  },
  {
    heading: "Direction and normalization",
    body: "Every move is normalized to the direction of the original reading, so a strong-base pair moving up and a strong-quote pair moving down both read as positive follow-through. Raw price moves are always shown alongside the normalized figures.",
  },
  {
    heading: "Classification bands",
    body: "Using only the normalized sixty-bar result: Continued when it finished at or above plus 0.50 percent, Reversed when it finished at or below minus 0.50 percent, and Mixed in between. The label never hides a negative number; the raw results are always displayed.",
  },
  {
    heading: "Publication policy",
    body: "Every completed qualifying case is published, including negative outcomes. Reviews only appear after their evaluation window closes, so nothing here was visible before the outcome was known.",
  },
  {
    heading: "Data source",
    body: "Evaluation prices come from the same production data source that produced the original reading. The review always evaluates on that same source, so the follow-through is measured on the exact prices the reading was based on.",
  },
];
