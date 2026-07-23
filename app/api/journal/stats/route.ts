import { NextResponse } from 'next/server';

import { requireSubscription } from '@/lib/auth/requireSubscription';

import { getJournalDashboardStats } from '@/lib/journal/server';
import { requireAuthenticatedUser } from '@/lib/supabase/server';

function unauthorized() {
  return NextResponse.json(
    { error: 'Authentication required to access journal stats.' },
    { status: 401 },
  );
}

export async function GET() {
  const denied = await requireSubscription();
  if (denied) return denied;

  const { supabase, user, error: authError } = await requireAuthenticatedUser();

  if (authError || !user) {
    return unauthorized();
  }

  try {
    const stats = await getJournalDashboardStats(supabase);
    return NextResponse.json(stats);
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'Journal stats could not be loaded.',
      },
      { status: 500 },
    );
  }
}
