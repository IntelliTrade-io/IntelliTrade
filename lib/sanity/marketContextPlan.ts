// Pure planner that decides, per asset, whether the automation should write a
// generated marketContext document for a given post+date, or stay out of the
// way. No Sanity client import: fully unit-testable.
//
// Conflict policy (per asset, for the target date):
//   - a published doc with a non-auto _id exists  -> skip-manual (editor owns it)
//   - the auto-id doc exists with manualOverride   -> skip-override (protected)
//   - otherwise                                    -> write the auto-id doc
//
// Writes use a deterministic _id so republishing the same post updates the same
// documents instead of creating duplicates.

export type PlanAsset = "gold" | "silver" | "oil" | "bitcoin";

export const HEADINGS: Record<PlanAsset, string> = {
  gold: "What's moving Gold today",
  silver: "What's moving Silver today",
  oil: "What's moving Oil today",
  bitcoin: "What's moving Bitcoin today",
};

export const AUTO_ID = (date: string, asset: PlanAsset): string =>
  `market-context-auto-${date}-${asset}`;

// Shape returned by the route's existing-docs GROQ query.
export type ExistingMarketContextDoc = {
  _id: string;
  asset: string;
  date: string;
  manualOverride?: boolean | null;
  sourcePostRef?: string | null;
};

export type MarketContextPayload = {
  _type: "marketContext";
  asset: PlanAsset;
  date: string;
  heading: string;
  paragraphs: { _key: string; text: string }[];
  sourcePost: { _type: "reference"; _ref: string; _weak: true };
  generatedAt: string;
};

export type PlanAction =
  | { asset: PlanAsset; kind: "write"; id: string; payload: MarketContextPayload }
  | { asset: PlanAsset; kind: "skip-manual"; id: string }
  | { asset: PlanAsset; kind: "skip-override"; id: string };

export type PlanMarketContextInput = {
  entries: Record<PlanAsset, string>;
  date: string;
  postId: string;
  existingDocs: ExistingMarketContextDoc[];
  // Injectable for deterministic tests; defaults to now.
  generatedAt?: string;
};

const ALL_ASSETS: PlanAsset[] = ["gold", "silver", "oil", "bitcoin"];

export function planMarketContextWrites(input: PlanMarketContextInput): PlanAction[] {
  const { entries, date, postId, existingDocs } = input;
  const generatedAt = input.generatedAt ?? new Date().toISOString();
  const actions: PlanAction[] = [];

  for (const asset of ALL_ASSETS) {
    const autoId = AUTO_ID(date, asset);
    // Only same-asset, same-date docs are relevant; the planner stays correct
    // even if callers pass docs from other dates.
    const docsForAsset = existingDocs.filter((doc) => doc.asset === asset && doc.date === date);
    const manualDoc = docsForAsset.find((doc) => doc._id !== autoId);
    if (manualDoc) {
      actions.push({ asset, kind: "skip-manual", id: manualDoc._id });
      continue;
    }

    const autoDoc = docsForAsset.find((doc) => doc._id === autoId);
    if (autoDoc && autoDoc.manualOverride === true) {
      actions.push({ asset, kind: "skip-override", id: autoId });
      continue;
    }

    const payload: MarketContextPayload = {
      _type: "marketContext",
      asset,
      date,
      heading: HEADINGS[asset],
      paragraphs: [{ _key: "auto-p1", text: entries[asset] }],
      sourcePost: { _type: "reference", _ref: postId, _weak: true },
      generatedAt,
    };
    actions.push({ asset, kind: "write", id: autoId, payload });
  }

  return actions;
}
