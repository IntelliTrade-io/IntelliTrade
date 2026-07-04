export type StaticZoneStrength = "weak" | "medium" | "strong";

export type DynamicOpportunityGrade = "blue" | "watch" | "blocked" | "green" | "elite_green" | "a_plus";

export type ZoneSide = "support" | "resistance";

export interface ReactionRange {
  min: number;
  max: number;
}

export interface CandleData {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
}

export interface AlphaScopeConfig {
  alphaName: string;
  candidateName: string;
  assetId: string;
  pair: string;
  timeframe: string;
  zoneSide: ZoneSide;
  providerAlias: string;
  modelVersion: string;
  stopBufferAtr: number;
  firstReactionTargetR: number;
  sessionFilter: string;
}

export interface SupportResistanceZone {
  id: string;
  assetId: string;
  pair: string;
  timeframe: string;
  zoneSide: ZoneSide;
  zoneLow: number;
  zoneHigh: number;
  zoneLabel: string;
  staticStrength: StaticZoneStrength;
  dynamicGrade: DynamicOpportunityGrade;
  reactionRange: ReactionRange;
  typicalMinimumR: number;
  typicalMaximumR?: number;
  sessionQuality: string;
  approachQuality: string;
  status: string;
  stopBufferAtr: number;
  firstReactionTargetR: number;
  lastUpdated: string;
  modelVersion: string;
  providerAlias: string;
  featured?: boolean;
  createdTime?: string | null;
  closeReclaim?: boolean;
  reclaimConfirmedAt?: string | null;
  notes?: string;
  educationalSummary: string;
  previewSpan?: {
    start: number;
    end: number;
  };
}

export interface ZoneDetails extends SupportResistanceZone {
  staticStrengthNote: string;
  dynamicGradeNote: string;
}

export interface ScannerRow {
  id: string;
  pair: string;
  timeframe: string;
  zoneSide: ZoneSide;
  staticStrength: StaticZoneStrength;
  dynamicGrade: DynamicOpportunityGrade;
  reactionRange: ReactionRange;
  typicalMinimumR: number;
  typicalMaximumR?: number;
  status: string;
}

export interface ResearchTierProfile {
  id: "green" | "elite_green" | "a_plus";
  label: string;
  scopeLabel: string;
  includedGrades: DynamicOpportunityGrade[];
  researchWinRate: number;
  researchAverageAfterCostR: number;
  researchTradesPerWeek: number;
  validationWinRate: number;
  validationAverageAfterCostR: number;
}

export interface OverlayPoint {
  label: string;
  close: number;
}

export interface SupabaseSupportResistanceRow {
  id: string;
  asset_id: string;
  provider_alias: string;
  pair: string;
  timeframe: string;
  zone_side: ZoneSide;
  zone_low: number;
  zone_high: number;
  static_strength: StaticZoneStrength;
  dynamic_grade: DynamicOpportunityGrade;
  reaction_range_low: number;
  reaction_range_high: number;
  typical_minimum_r: number;
  typical_maximum_r: number | null;
  session_quality: string;
  approach_quality: string;
  status: string;
  created_at: string;
  updated_at: string;
  model_version: string;
  notes: string | null;
}
