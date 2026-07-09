import { describe, expect, it } from "vitest";
import { supportResistanceCopy } from "./copy";
import { supportResistanceAlphaScope, supportResistanceMockZones } from "./mockData";
import { buildScannerRows, formatReactionRange, fromSupabaseRow, isGreenTierGrade, selectFeaturedZone, toSupabaseRow } from "./model";

describe("support resistance Alpha model", () => {
  it("defaults to the highest dynamic-grade zone for the primary dashboard selection", () => {
    expect(selectFeaturedZone(supportResistanceMockZones)?.id).toBe("sr-eurusd-bid-pocket");
  });

  it("sorts scanner rows by dynamic grade and keeps blocked context behind active rows", () => {
    const rows = buildScannerRows(supportResistanceMockZones);
    expect(rows[0]!.id).toBe("sr-eurusd-bid-pocket");
    expect(rows.map((row) => row.status)).toEqual([
      "A+ review",
      "Elite review",
      "Active review",
      "Monitor only",
      "Monitor only",
      "Blocked",
    ]);
    expect(rows.findIndex((row) => row.id === "sr-eurusd-late-session-blocked")).toBeGreaterThan(
      rows.findIndex((row) => row.id === "sr-eurusd-london-balance"),
    );
  });

  it("maps the display zone into a Supabase-ready row with canonical asset metadata", () => {
    const row = toSupabaseRow(supportResistanceMockZones[0]!);
    expect(row.asset_id).toBe(supportResistanceAlphaScope.assetId);
    expect(row.provider_alias).toBe(supportResistanceAlphaScope.providerAlias);
    expect(row.dynamic_grade).toBe("elite_green");
    expect(row.zone_side).toBe("support");
    expect(row.reaction_range_low).toBe(70);
    expect(row.reaction_range_high).toBe(78);
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
    expect(hydrated.dynamicGrade).toBe("elite_green");
    expect(hydrated.reactionRange).toEqual({ min: 70, max: 78 });
  });

  it("preserves educational reaction-range formatting and non-signal disclaimer language", () => {
    expect(formatReactionRange({ min: 70, max: 78 })).toBe("70-78%");
    expect(isGreenTierGrade("elite_green")).toBe(true);
    expect(isGreenTierGrade("watch")).toBe(false);
    expect(supportResistanceCopy.disclaimer).toContain("not trading signals");
    expect(supportResistanceCopy.disclaimer).toContain("educational decision support");
  });
});
