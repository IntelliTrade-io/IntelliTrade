import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export async function GET() {
  try {
    const supabase = createClient(supabaseUrl, supabaseKey);
    
    // Fetch all events from the economic_events table
    // Ordered by date_time_utc ascending (upcoming events first)
    const { data, error } = await supabase
      .from('economic_events')
      .select('*')
      .order('date_time_utc', { ascending: true });
    
    if (error) {
      console.error('Supabase error:', error);
      return NextResponse.json(
        { error: 'Failed to fetch events from database' },
        { status: 500 }
      );
    }
    
    // Transform data to match your EconEvent type
    const events = data.map((event) => ({
      id: event.id,
      source: event.source,
      agency: event.agency,
      country: event.country,
      title: event.title,
      date_time_utc: event.date_time_utc,
      event_local_tz: event.event_local_tz,
      impact: event.impact,
      url: event.url,
      extras: event.extras || {}
    }));
    
    return NextResponse.json(events);
    
  } catch (error) {
    console.error('API error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
