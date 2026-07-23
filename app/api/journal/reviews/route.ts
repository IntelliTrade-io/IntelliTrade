import { NextRequest, NextResponse } from 'next/server';

import { requireSubscription } from '@/lib/auth/requireSubscription';
import { ZodError } from 'zod';

import { saveJournalReview } from '@/lib/journal/server';
import { requireAuthenticatedUser } from '@/lib/supabase/server';
import { ReviewSaveSchema } from '@/lib/journal/validation';

function unauthorized() {
  return NextResponse.json(
    { error: 'Authentication required to access review data.' },
    { status: 401 },
  );
}

export async function POST(req: NextRequest) {
  const payload = await req.json();
  let body;

  try {
    body = ReviewSaveSchema.parse(payload);
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json(
        {
          error: 'Review payload is invalid.',
          details: error.flatten(),
        },
        { status: 400 },
      );
    }

    throw error;
  }

  const denied = await requireSubscription();
  if (denied) return denied;

  const { supabase, user, error: authError } = await requireAuthenticatedUser();

  if (authError || !user) {
    return unauthorized();
  }

  try {
    const result = await saveJournalReview(supabase, user.id, body);

    return NextResponse.json({
      id: result.id,
      action: result.action,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'Review could not be saved.',
      },
      { status: 500 },
    );
  }
}
