import { describe, expect, it } from "vitest";
import { cohortRateTooltip, reactionRateTooltip, supportResistanceCopy } from "./copy";
import {
  GRADE_COHORTS,
  GRADE_DISPLAY_ORDER,
  GRADE_TOKENS,
  HISTORICAL_REACTION_RATE,
  dynamicOpportunityGradeConfig,
  gradeSummaryLine,
} from "./gradeConfig";
import { supportResistanceAlphaScope, supportResistanceMockZones } from "./mockData";
import { buildScannerRows, formatReactionRange, fromSupabaseRow, isGreenTierGrade, selectFeaturedZone, toSupabaseRow } from "./model";

describe("support resistance Alpha model", () => {
  it("defaults to the highest dynamic-grade zone for the primary dashboard selection", () => {
    expect(selectFeaturedZone(supportResistanceMockZones)?.id).toBe("sr-eurusd-a-plus");
  });

  it("sorts scanner rows by dynamic grade and keeps blocked context behind active rows", () => {
    const rows = buildScannerRows(supportResistanceMockZones);
    expect(rows[0]!.id).toBe("sr-eurusd-a-plus");
    expect(rows.map((row) => row.status)).toEqual([
      "A+ review",
      "Elite review",
      "Active review",
      "Below threshold",
      "Informational",
      "Not qualified",
    ]);
    expect(rows.findIndex((row) => row.id === "sr-eurusd-blocked")).toBeGreaterThan(
      rows.findIndex((row) => row.id === "sr-eurusd-green"),
    );
  });

  it("teaches grades in ascending order (Blocked → Informational → Watch → Green → Elite Green → A+)", () => {
    expect(GRADE_DISPLAY_ORDER).toEqual(["blocked", "blue", "watch", "green", "elite_green", "a_plus"]);

    // Scanner rows rank by current opportunity quality, best first — Watch must
    // never render above Elite Green, Informational never above Watch.
    const rows = buildScannerRows(supportResistanceMockZones);
    expect(rows.map((row) => row.dynamicGrade)).toEqual([...GRADE_DISPLAY_ORDER].reverse());
  });

  it("locks the final grade colour tokens (crimson/slate/amber/emerald/mint/violet)", () => {
    expect(GRADE_TOKENS.blocked.text).toBe("#FB7185");
    expect(GRADE_TOKENS.blue.text).toBe("#94A3B8");
    expect(GRADE_TOKENS.watch.text).toBe("#F59E0B");
    // Green = deeper emerald (lower tier); Elite Green = brighter mint (higher
    // tier), so the stronger grade always reads brighter than Green.
    expect(GRADE_TOKENS.green.text).toBe("#34D399");
    expect(GRADE_TOKENS.elite_green.text).toBe("#86EFAC");
    expect(GRADE_TOKENS.a_plus.text).toBe("#A78BFA");

    // Restrained glow ONLY for the top two tiers.
    expect(GRADE_TOKENS.a_plus.glow).toContain("rgba(124, 58, 237");
    expect(GRADE_TOKENS.elite_green.glow).toContain("rgba(74, 222, 128");
    expect(GRADE_TOKENS.blocked.glow).toBeUndefined();
    expect(GRADE_TOKENS.blue.glow).toBeUndefined();
    expect(GRADE_TOKENS.watch.glow).toBeUndefined();
    expect(GRADE_TOKENS.green.glow).toBeUndefined();
  });

  it("presents the historical figures as cumulative cohorts with their resolved samples", () => {
    expect(GRADE_COHORTS.green).toEqual({
      label: "Green+ cohort",
      includes: ["green", "elite_green", "a_plus"],
      resolvedSample: 155,
    });
    expect(GRADE_COHORTS.elite_green).toEqual({
      label: "Elite+ cohort",
      includes: ["elite_green", "a_plus"],
      resolvedSample: 109,
    });
    expect(GRADE_COHORTS.a_plus).toEqual({ label: "A+ cohort", includes: ["a_plus"], resolvedSample: 67 });

    // The cohort tooltip must explain the cumulative buckets and the sample.
    const tooltip = cohortRateTooltip("green");
    expect(tooltip).toContain("Green+ includes Green, Elite Green, and A+");
    expect(tooltip).toContain("Elite+ includes Elite Green and A+");
    expect(tooltip).toContain("Unresolved events are excluded");
    expect(tooltip).toContain("155 resolved events");
    expect(cohortRateTooltip("a_plus")).toContain("86.57%");
    expect(cohortRateTooltip("a_plus")).toContain("67 resolved events");

    // Cumulative framing lives in the grade descriptions too — never an
    // exclusive per-grade claim.
    expect(dynamicOpportunityGradeConfig.green.description).toContain("Green+ cohort");
    expect(dynamicOpportunityGradeConfig.elite_green.description).toContain("Elite+ cohort");
    expect(dynamicOpportunityGradeConfig.a_plus.description).toContain("A+ cohort");
  });

  it("uses the exact validated historical reaction rates — never rounded, never the legacy numbers", () => {
    expect(HISTORICAL_REACTION_RATE.a_plus).toBe(86.57);
    expect(HISTORICAL_REACTION_RATE.elite_green).toBe(84.4);
    expect(HISTORICAL_REACTION_RATE.green).toBe(81.94);
    expect(HISTORICAL_REACTION_RATE.watch).toBeUndefined();
    expect(HISTORICAL_REACTION_RATE.blue).toBeUndefined();
    expect(HISTORICAL_REACTION_RATE.blocked).toBeUndefined();

    expect(gradeSummaryLine("a_plus")).toBe("86.57% historical reaction rate");
    expect(gradeSummaryLine("elite_green", true)).toBe("84.40% historical 0.50R first-reaction rate");
    expect(gradeSummaryLine("watch")).toBe("Below activation threshold");
    expect(gradeSummaryLine("blue")).toBe("Support zone only");
    expect(gradeSummaryLine("blocked")).toBe("Conditions not qualified");
  });

  it("labels the blue grade as Informational on every surface and frames rates as historical, not probability", () => {
    expect(dynamicOpportunityGradeConfig.blue.label).toBe("Informational");
    expect(reactionRateTooltip(86.57)).toContain("comparable resolved historical setups");
    expect(reactionRateTooltip(86.57)).toContain("do not guarantee future performance");
    expect(reactionRateTooltip(86.57)).not.toContain("probability");
  });

  it("maps the display zone into a Supabase-ready row with canonical asset metadata", () => {
    const row = toSupabaseRow(supportResistanceMockZones[0]!);
    expect(row.asset_id).toBe(supportResistanceAlphaScope.assetId);
    expect(row.provider_alias).toBe(supportResistanceAlphaScope.providerAlias);
    expect(row.dynamic_grade).toBe("a_plus");
    expect(row.zone_side).toBe("support");
    expect(row.reaction_range_low).toBe(82);
    expect(row.reaction_range_high).toBe(90);
  });

  it("can hydrate a UI zone back from a Supabase row at the feature boundary", () => {
    const row = toSupabaseRow(supportResistanceMockZones[0]!);
    const hydrated = fromSupabaseRow(row, {
      zoneLabel: "Hydrated zone",
      educationalSummary: "Loaded from Supabase.",
      featured: true,
    });

    expect(hydrated.zoneLabel).toBe("Hydrated zone");
    expect(hydrated.educationalSummary).toBe("Loaded from Supabase.");
    expect(hydrated.featured).toBe(true);
    expect(hydrated.dynamicGrade).toBe("a_plus");
    expect(hydrated.reactionRange).toEqual({ min: 82, max: 90 });
  });

  it("marks unqualified grades as not research-qualified instead of showing a rate", () => {
    expect(formatReactionRange({ min: 0, max: 0 })).toBe("Not research-qualified");
    const watchZone = supportResistanceMockZones.find((z) => z.dynamicGrade === "watch")!;
    expect(formatReactionRange(watchZone.reactionRange)).toBe("Not research-qualified");
  });

  it("keeps zone rank aligned with vertical chart position (higher grade = higher price band)", () => {
    const byRank = buildScannerRows(supportResistanceMockZones).map(
      (row) => supportResistanceMockZones.find((z) => z.id === row.id)!.zoneLow,
    );
    const descending = [...byRank].sort((a, b) => b - a);
    expect(byRank).toEqual(descending);
  });

  it("preserves educational reaction-range formatting and non-signal disclaimer language", () => {
    expect(formatReactionRange({ min: 70, max: 78 })).toBe("70-78%");
    expect(isGreenTierGrade("elite_green")).toBe(true);
    expect(isGreenTierGrade("watch")).toBe(false);
    expect(supportResistanceCopy.disclaimer).toContain("not trading signals");
    expect(supportResistanceCopy.disclaimer).toContain("educational decision support");
  });
});
