import { NextRequest, NextResponse } from 'next/server';

import { requireSubscription } from '@/lib/auth/requireSubscription';
import { ZodError } from 'zod';

import {
  applyTradeListFilters,
  assertOwnedTradeReferences,
  getTradeListSelect,
  mapTradeList,
} from '@/lib/journal/server';
import { requireAuthenticatedUser } from '@/lib/supabase/server';
import { CreateTradeSchema, TradeQuerySchema } from '@/lib/journal/validation';

function unauthorized() {
  return NextResponse.json({ error: 'Authentication required to access journal data.' }, { status: 401 });
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const query = TradeQuerySchema.parse(Object.fromEntries(url.searchParams.entries()));
  const denied = await requireSubscription();
  if (denied) return denied;

  const { supabase, user, error: authError } = await requireAuthenticatedUser();

  if (authError || !user) {
    return unauthorized();
  }

  const from = (query.page - 1) * query.limit;
  const to = from + query.limit - 1;

  let builder = supabase
    .from('trades')
    .select(getTradeListSelect(), { count: 'exact' })
    .order('opened_at', { ascending: false })
    .range(from, to);

  builder = applyTradeListFilters(builder, query);

  const { data, count, error } = await builder;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const rows = mapTradeList((data ?? []) as never[]);
  const pages = Math.max(1, Math.ceil((count ?? 0) / query.limit));

  return NextResponse.json({
    data: rows,
    pagination: {
      page: query.page,
      limit: query.limit,
      total: count ?? 0,
      pages,
    },
  });
}

export async function POST(req: NextRequest) {
  const payload = await req.json();
  let body;
  try {
    body = CreateTradeSchema.parse(payload);
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json({ error: 'Trade payload is invalid.', details: error.flatten() }, { status: 400 });
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

  const { data, error } = await supabase.rpc('create_journal_trade', {
    p_account_id: body.account_id,
    p_instrument_id: body.instrument_id,
    p_strategy_id: body.strategy_id ?? null,
    p_setup: body.setup ?? null,
    p_bias: body.bias,
    p_thesis: body.thesis ?? null,
    p_risk_per_trade: body.risk_per_trade ?? null,
    p_target_r: body.target_r ?? null,
    p_tags: body.tags,
    p_opened_at: body.opened_at,
    p_screenshot_urls: body.screenshot_urls,
    p_legs: body.legs,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ id: data }, { status: 201 });
}
