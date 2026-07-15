import { describe, it, expect } from "vitest";
import {
  planMarketContextWrites,
  AUTO_ID,
  HEADINGS,
  type ExistingMarketContextDoc,
  type PlanAsset,
} from "@/lib/sanity/marketContextPlan";

const DATE = "2026-07-15";
const POST_ID = "post-123";
const GENERATED_AT = "2026-07-15T06:00:00.000Z";
const ASSETS: PlanAsset[] = ["gold", "silver", "oil", "bitcoin"];

const entries = {
  gold: "Gold paragraph. [USD]",
  silver: "Silver paragraph. [YIELDS]",
  oil: "Oil paragraph. [SUPPLY]",
  bitcoin: "Bitcoin paragraph. [RISK]",
};

function plan(existingDocs: ExistingMarketContextDoc[]) {
  return planMarketContextWrites({
    entries,
    date: DATE,
    postId: POST_ID,
    existingDocs,
    generatedAt: GENERATED_AT,
  });
}

describe("planMarketContextWrites", () => {
  it("first publish (no existing docs) -> 4 writes with deterministic ids and payloads", () => {
    const actions = plan([]);
    expect(actions).toHaveLength(4);
    for (const asset of ASSETS) {
      const action = actions.find((a) => a.asset === asset);
      expect(action?.kind).toBe("write");
      if (action?.kind !== "write") continue;
      expect(action.id).toBe(AUTO_ID(DATE, asset));
      expect(action.payload).toMatchObject({
        _type: "marketContext",
        asset,
        date: DATE,
        heading: HEADINGS[asset],
        paragraphs: [{ _key: "auto-p1", text: entries[asset] }],
        sourcePost: { _type: "reference", _ref: POST_ID, _weak: true },
        generatedAt: GENERATED_AT,
      });
    }
  });

  it("republish (auto ids exist, no override) -> 4 writes to the SAME ids", () => {
    const existing: ExistingMarketContextDoc[] = ASSETS.map((asset) => ({
      _id: AUTO_ID(DATE, asset),
      asset,
      date: DATE,
      manualOverride: false,
      sourcePostRef: POST_ID,
    }));
    const actions = plan(existing);
    expect(actions.every((a) => a.kind === "write")).toBe(true);
    for (const asset of ASSETS) {
      const action = actions.find((a) => a.asset === asset);
      expect(action?.id).toBe(AUTO_ID(DATE, asset));
    }
  });

  it("a manual doc for one asset+date -> that asset skip-manual, others write", () => {
    const existing: ExistingMarketContextDoc[] = [
      { _id: "random-uuid-manual-gold", asset: "gold", date: DATE, manualOverride: false, sourcePostRef: null },
    ];
    const actions = plan(existing);
    const gold = actions.find((a) => a.asset === "gold");
    expect(gold?.kind).toBe("skip-manual");
    expect(gold?.id).toBe("random-uuid-manual-gold");
    for (const asset of ["silver", "oil", "bitcoin"] as PlanAsset[]) {
      expect(actions.find((a) => a.asset === asset)?.kind).toBe("write");
    }
  });

  it("an auto doc with manualOverride true -> that asset skip-override", () => {
    const existing: ExistingMarketContextDoc[] = [
      { _id: AUTO_ID(DATE, "gold"), asset: "gold", date: DATE, manualOverride: true, sourcePostRef: POST_ID },
    ];
    const actions = plan(existing);
    const gold = actions.find((a) => a.asset === "gold");
    expect(gold?.kind).toBe("skip-override");
    expect(gold?.id).toBe(AUTO_ID(DATE, "gold"));
    for (const asset of ["silver", "oil", "bitcoin"] as PlanAsset[]) {
      expect(actions.find((a) => a.asset === asset)?.kind).toBe("write");
    }
  });

  it("ignores docs from other dates even if passed to the planner", () => {
    const existing: ExistingMarketContextDoc[] = [
      // Same asset, DIFFERENT date -> irrelevant.
      { _id: "old-manual-gold", asset: "gold", date: "2020-01-01", manualOverride: true, sourcePostRef: null },
      { _id: AUTO_ID("2020-01-01", "silver"), asset: "silver", date: "2020-01-01", manualOverride: true },
    ];
    const actions = plan(existing);
    // All four still write because nothing matches the target date.
    expect(actions.every((a) => a.kind === "write")).toBe(true);
  });
});
