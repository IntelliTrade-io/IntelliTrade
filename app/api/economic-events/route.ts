import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

// Always render fresh — never serve a cached/stale response from Vercel edge or Next.js ISR
export const dynamic = 'force-dynamic';
export const revalidate = 0;

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

/**
 * Dedup safety net: after the prune-before-upsert fix in the upload script,
 * stale rows should be gone. This deduplicates any that remain by grouping on
 * (country, title, UTC-date) and keeping the earliest time per group — which is
 * the corrected version (e.g. 09:00 UTC not 11:00 UTC for fixed Eurostat events).
 */
function deduplicateEvents(events: Record<string, unknown>[]): Record<string, unknown>[] {
  const seen = new Map<string, Record<string, unknown>>();
  for (const ev of events) {
    const dateStr = (ev.date_time_utc as string)?.slice(0, 10) ?? "";
    const key = `${ev.country}|${ev.title}|${dateStr}`;
    if (!seen.has(key)) {
      seen.set(key, ev);
    }
    // keep first (data is ordered by date_time_utc asc, so earliest = corrected version)
  }
  return Array.from(seen.values());
}

export async function GET() {
  try {
    const supabase = createClient(supabaseUrl, supabaseKey);

    const startOfToday = new Date();
    startOfToday.setUTCHours(0, 0, 0, 0);

    const { data, error } = await supabase
      .from('economic_events')
      .select('*')
      .gte('date_time_utc', startOfToday.toISOString())
      .order('date_time_utc', { ascending: true });

    if (error) {
      console.error('Supabase error:', error);
      return NextResponse.json({ error: 'Failed to fetch events from database' }, { status: 500 });
    }

    const raw = (data ?? []).map((event) => ({
      id: event.scraperID ?? String(event.id),
      source: event.source,
      agency: event.agency,
      country: event.country,
      title: event.title,
      date_time_utc: event.date_time_utc,
      event_local_tz: event.event_local_tz,
      impact: event.impact,
      url: event.url,
      extras: event.extras || {},
      default_dashboard: event.default_dashboard ?? false,
      event_group_key: event.event_group_key ?? null,
      event_group_title: event.event_group_title ?? null,
      event_group_type: event.event_group_type ?? null,
      event_group_priority: event.event_group_priority ?? null,
      trader_relevance_score: event.trader_relevance_score ?? null,
      asset_focus: event.asset_focus ?? [],
      source_reliability: event.source_reliability ?? null,
      time_confidence: event.time_confidence ?? null,
      source_url: event.source_url ?? null,
      source_name: event.source_name ?? null,
      lkg_used: event.lkg_used ?? null,
      curated_fallback_reviewed_at: event.curated_fallback_reviewed_at ?? null,
      curated_fallback_age_days: event.curated_fallback_age_days ?? null,
      curated_fallback_max_age_days: event.curated_fallback_max_age_days ?? null,
      post_release_status: event.post_release_status ?? null,
      schedule_confidence: event.schedule_confidence ?? null,
      bls_selected_source_path: event.bls_selected_source_path ?? null,
    }));

    const events = deduplicateEvents(raw);

    return NextResponse.json(events, {
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate',
      },
    });

  } catch (error) {
    console.error('API error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
