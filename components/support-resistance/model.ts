import { DYNAMIC_GRADE_ORDER, STATIC_STRENGTH_ORDER, dynamicOpportunityGradeConfig, staticStrengthConfig } from "./gradeConfig";
import type {
  DynamicOpportunityGrade,
  ReactionRange,
  ScannerRow,
  StaticZoneStrength,
  SupportResistanceZone,
  SupabaseSupportResistanceRow,
  ZoneDetails,
} from "./types";

export function getDynamicGradeRank(grade: DynamicOpportunityGrade): number {
  return DYNAMIC_GRADE_ORDER.indexOf(grade);
}

export function getStaticStrengthRank(strength: StaticZoneStrength): number {
  return STATIC_STRENGTH_ORDER.indexOf(strength);
}

export function isGreenTierGrade(grade: DynamicOpportunityGrade): boolean {
  return grade === "green" || grade === "elite_green" || grade === "a_plus";
}

export function isEliteTierGrade(grade: DynamicOpportunityGrade): boolean {
  return grade === "elite_green" || grade === "a_plus";
}

export function formatReactionRange(range: ReactionRange): string {
  return `${range.min.toFixed(0)}-${range.max.toFixed(0)}%`;
}

export function compareZonesByPriority(left: SupportResistanceZone, right: SupportResistanceZone): number {
  const gradeDelta = getDynamicGradeRank(right.dynamicGrade) - getDynamicGradeRank(left.dynamicGrade);
  if (gradeDelta !== 0) {
    return gradeDelta;
  }

  if (left.featured && !right.featured) {
    return -1;
  }
  if (!left.featured && right.featured) {
    return 1;
  }

  const strengthDelta = getStaticStrengthRank(right.staticStrength) - getStaticStrengthRank(left.staticStrength);
  if (strengthDelta !== 0) {
    return strengthDelta;
  }

  return new Date(right.lastUpdated).getTime() - new Date(left.lastUpdated).getTime();
}

export function buildScannerRows(zones: SupportResistanceZone[]): ScannerRow[] {
  return [...zones]
    .sort(compareZonesByPriority)
    .map((zone) => ({
      id: zone.id,
      pair: zone.pair,
      timeframe: zone.timeframe,
      zoneSide: zone.zoneSide,
      staticStrength: zone.staticStrength,
      dynamicGrade: zone.dynamicGrade,
      reactionRange: zone.reactionRange,
      typicalMinimumR: zone.typicalMinimumR,
      typicalMaximumR: zone.typicalMaximumR,
      status: dynamicOpportunityGradeConfig[zone.dynamicGrade].scannerStatus,
    }));
}

export function selectFeaturedZone(zones: SupportResistanceZone[]): SupportResistanceZone | null {
  if (!zones.length) {
    return null;
  }

  return [...zones].sort(compareZonesByPriority)[0] ?? null;
}

export function buildZoneDetails(zone: SupportResistanceZone): ZoneDetails {
  return {
    ...zone,
    staticStrengthNote: staticStrengthConfig[zone.staticStrength].description,
    dynamicGradeNote: dynamicOpportunityGradeConfig[zone.dynamicGrade].description,
  };
}

export function toSupabaseRow(zone: SupportResistanceZone): SupabaseSupportResistanceRow {
  return {
    id: zone.id,
    asset_id: zone.assetId,
    provider_alias: zone.providerAlias,
    pair: zone.pair,
    timeframe: zone.timeframe,
    zone_side: zone.zoneSide,
    zone_low: zone.zoneLow,
    zone_high: zone.zoneHigh,
    static_strength: zone.staticStrength,
    dynamic_grade: zone.dynamicGrade,
    reaction_range_low: zone.reactionRange.min,
    reaction_range_high: zone.reactionRange.max,
    typical_minimum_r: zone.typicalMinimumR,
    typical_maximum_r: zone.typicalMaximumR ?? null,
    session_quality: zone.sessionQuality,
    approach_quality: zone.approachQuality,
    status: zone.status,
    created_at: zone.lastUpdated,
    updated_at: zone.lastUpdated,
    model_version: zone.modelVersion,
    notes: zone.notes ?? null,
  };
}

export function fromSupabaseRow(
  row: SupabaseSupportResistanceRow,
  overrides: Partial<Pick<SupportResistanceZone, "zoneLabel" | "educationalSummary" | "previewSpan" | "featured">> = {},
): SupportResistanceZone {
  return {
    id: row.id,
    assetId: row.asset_id,
    providerAlias: row.provider_alias,
    pair: row.pair,
    timeframe: row.timeframe,
    zoneSide: row.zone_side,
    zoneLow: row.zone_low,
    zoneHigh: row.zone_high,
    zoneLabel: overrides.zoneLabel ?? `${row.pair} support zone`,
    staticStrength: row.static_strength,
    dynamicGrade: row.dynamic_grade,
    reactionRange: {
      min: row.reaction_range_low,
      max: row.reaction_range_high,
    },
    typicalMinimumR: row.typical_minimum_r,
    typicalMaximumR: row.typical_maximum_r ?? undefined,
    sessionQuality: row.session_quality,
    approachQuality: row.approach_quality,
    status: row.status,
    stopBufferAtr: 0.3,
    firstReactionTargetR: 0.5,
    lastUpdated: row.updated_at,
    modelVersion: row.model_version,
    featured: overrides.featured ?? false,
    notes: row.notes ?? undefined,
    educationalSummary: overrides.educationalSummary ?? "Supabase-backed Alpha zone.",
    previewSpan: overrides.previewSpan,
  };
}
