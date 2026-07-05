// Economic-calendar domain types (plan 5.6). UI/workspace types stay in
// components/dashboardv2/types.ts, which re-exports these for back-compat.

export type ImpactLevel = "high" | "medium" | "low";

export interface EventExtras {
  release_time_local: string;
  event_local_tz: string;
  time_confidence: string;
  category: string;
  source_url_standardized: string;
  event_description: string;
  pair_relevance: { primary_fx_pairs: string[]; related_assets: string[] };
  // central bank speaker fields
  speaker_event?: boolean;
  speaker_name?: string;
  speaker_role?: string;
  speaker_institution?: string;
  speaker_priority?: number | null;
  speech_topic?: string;
  policy_relevance?: string;
}

export interface CalendarEvent {
  id: string;
  isoDateTime: string;
  dateLabel: string;
  timeLabel: string;
  currency: string;
  region: string;
  flagCode: string;
  title: string;
  impact: ImpactLevel;
  agency: string;
  source: string;
  rawUrl: string;
  extras: EventExtras;
  // v8 scraper fields
  defaultDashboard: boolean;
  eventGroupKey: string | null;
  eventGroupTitle: string | null;
  eventGroupType: string | null;
  eventGroupPriority: number | null;
  traderRelevanceScore: number | null;
  assetFocus: string[];
  sourceReliability: string | null;
  sourceName: string | null;
  sourceUrl: string | null;
  lkgUsed: boolean | null;
  curatedFallbackReviewedAt: string | null;
  curatedFallbackAgeDays: number | null;
  curatedFallbackMaxAgeDays: number | null;
  postReleaseStatus: string | null;
  scheduleConfidence: string | null;
  blsSelectedSourcePath: string | null;
}
