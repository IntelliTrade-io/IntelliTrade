import { NextRequest, NextResponse } from 'next/server';

import { requireSubscription } from '@/lib/auth/requireSubscription';
import { ZodError } from 'zod';

import {
  assertOwnedTradeReferences,
  deleteTradeWithScreenshotCleanup,
  getTradeDetailById,
  getTradeUpdatePayload,
} from '@/lib/journal/server';
import { requireAuthenticatedUser } from '@/lib/supabase/server';
import { UpdateTradeSchema } from '@/lib/journal/validation';

function unauthorized() {
  return NextResponse.json({ error: 'Authentication required to access journal data.' }, { status: 401 });
}

function notFound() {
  return NextResponse.json({ error: 'Trade not found.' }, { status: 404 });
}

export async function GET(_: NextRequest, { params }: { params: { id: string } }) {
  const denied = await requireSubscription();
  if (denied) return denied;

  const { supabase, user, error: authError } = await requireAuthenticatedUser();

  if (authError || !user) {
    return unauthorized();
  }

  let data;
  try {
    data = await getTradeDetailById(supabase, params.id);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Trade detail could not be loaded.' }, { status: 500 });
  }

  if (!data) {
    return notFound();
  }

  return NextResponse.json(data);
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  let body;
  try {
    body = UpdateTradeSchema.parse(await req.json());
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json(
        {
          error: 'Trade update payload is invalid.',
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
    await assertOwnedTradeReferences(supabase, body);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Reference validation failed.' }, { status: 400 });
  }

  let updatePayload: Record<string, unknown>;
  try {
    updatePayload = getTradeUpdatePayload(body);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Invalid update payload.' }, { status: 400 });
  }

  if (Object.keys(updatePayload).length === 0) {
    return NextResponse.json({ error: 'No supported trade fields were provided for update.' }, { status: 400 });
  }

  const { data, error } = await supabase.from('trades').update(updatePayload).eq('id', params.id).select('id').maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!data) {
    return notFound();
  }

  return NextResponse.json({ ok: true, id: data.id });
}

export async function DELETE(_: NextRequest, { params }: { params: { id: string } }) {
  const denied = await requireSubscription();
  if (denied) return denied;

  const { supabase, user, error: authError } = await requireAuthenticatedUser();

  if (authError || !user) {
    return unauthorized();
  }

  let result;
  try {
    result = await deleteTradeWithScreenshotCleanup(supabase, params.id);
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'Trade could not be deleted.',
      },
      { status: 500 },
    );
  }

  if (!result) {
    return notFound();
  }

  return NextResponse.json({
    ok: true,
    id: result.id,
    screenshot_cleanup: result.screenshot_cleanup,
    cleanup_error: result.cleanup_error,
  });
}
