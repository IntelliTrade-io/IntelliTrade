import { NextRequest, NextResponse } from 'next/server';

import { requireSubscription } from '@/lib/auth/requireSubscription';
import { ZodError } from 'zod';

import {
  buildJournalExportFileName,
  serializeJournalExportDocument,
  serializeReviewExportCsv,
  serializeTradeExportCsv,
} from '@/lib/journal/exports';
import {
  buildJournalReviewsExportDocument,
  buildJournalTradesExportDocument,
  getJournalReviewExportRows,
  getJournalTradeExportRows,
} from '@/lib/journal/server';
import { requireAuthenticatedUser } from '@/lib/supabase/server';
import { JournalExportQuerySchema } from '@/lib/journal/validation';

function unauthorized() {
  return NextResponse.json(
    { error: 'Authentication required to export journal data.' },
    { status: 401 },
  );
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  let query;

  try {
    query = JournalExportQuerySchema.parse(
      Object.fromEntries(url.searchParams.entries()),
    );
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json(
        {
          error: 'Export query is invalid.',
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
    if (query.resource === 'trades') {
      const rows = await getJournalTradeExportRows(supabase, query);
      const fileName = buildJournalExportFileName(query);

      if (query.format === 'csv') {
        return new NextResponse(serializeTradeExportCsv(rows), {
          status: 200,
          headers: {
            'Cache-Control': 'no-store',
            'Content-Disposition': `attachment; filename="${fileName}"`,
            'Content-Type': 'text/csv; charset=utf-8',
          },
        });
      }

      return new NextResponse(
        serializeJournalExportDocument(
          buildJournalTradesExportDocument(query, rows),
        ),
        {
          status: 200,
          headers: {
            'Cache-Control': 'no-store',
            'Content-Disposition': `attachment; filename="${fileName}"`,
            'Content-Type': 'application/json; charset=utf-8',
          },
        },
      );
    }

    const rows = await getJournalReviewExportRows(supabase, query);
    const fileName = buildJournalExportFileName(query);

    if (query.format === 'csv') {
      return new NextResponse(serializeReviewExportCsv(rows), {
        status: 200,
        headers: {
          'Cache-Control': 'no-store',
          'Content-Disposition': `attachment; filename="${fileName}"`,
          'Content-Type': 'text/csv; charset=utf-8',
        },
      });
    }

    return new NextResponse(
      serializeJournalExportDocument(
        buildJournalReviewsExportDocument(query, rows),
      ),
      {
        status: 200,
        headers: {
          'Cache-Control': 'no-store',
          'Content-Disposition': `attachment; filename="${fileName}"`,
          'Content-Type': 'application/json; charset=utf-8',
        },
      },
    );
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : 'Export could not be created.',
      },
      { status: 500 },
    );
  }
}
