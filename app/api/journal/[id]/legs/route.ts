import { NextRequest, NextResponse } from 'next/server';

import { requireSubscription } from '@/lib/auth/requireSubscription';
import { ZodError } from 'zod';

import { requireAuthenticatedUser } from '@/lib/supabase/server';
import { ReplaceTradeLegsSchema } from '@/lib/journal/validation';

function unauthorized() {
  return NextResponse.json(
    { error: 'Authentication required to update trade legs.' },
    { status: 401 },
  );
}

function notFound() {
  return NextResponse.json({ error: 'Trade not found.' }, { status: 404 });
}

export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  let body;
  try {
    body = ReplaceTradeLegsSchema.parse(await req.json());
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json(
        {
          error: 'Trade leg payload is invalid.',
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

  const { data, error } = await supabase.rpc('replace_journal_trade_legs', {
    p_trade_id: params.id,
    p_legs: body.legs,
  });

  if (error) {
    if (error.message.includes('not found')) {
      return notFound();
    }
    return NextResponse.json(
      {
        error: error.message || 'Trade legs could not be updated.',
      },
      { status: 500 },
    );
  }

  return NextResponse.json({
    ok: true,
    trade_id: params.id,
    leg_count: data ?? body.legs.length,
  });
}
