import { NextRequest, NextResponse } from 'next/server';

import { requireSubscription } from '@/lib/auth/requireSubscription';

import {
  buildTradeScreenshotPath,
  JOURNAL_SCREENSHOTS_BUCKET,
  validateScreenshotCandidate,
} from '@/lib/journal/uploads';
import {
  getTradeScreenshotStateById,
  saveTradeScreenshotPaths,
} from '@/lib/journal/server';
import { requireAuthenticatedUser } from '@/lib/supabase/server';

function unauthorized() {
  return NextResponse.json(
    { error: 'Authentication required to upload trade screenshots.' },
    { status: 401 },
  );
}

function notFound() {
  return NextResponse.json({ error: 'Trade not found.' }, { status: 404 });
}

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const denied = await requireSubscription();
  if (denied) return denied;

  const { supabase, user, error: authError } = await requireAuthenticatedUser();

  if (authError || !user) {
    return unauthorized();
  }

  let trade: Awaited<ReturnType<typeof getTradeScreenshotStateById>>;
  try {
    trade = await getTradeScreenshotStateById(supabase, params.id);
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'Trade screenshot state could not be loaded.',
      },
      { status: 500 },
    );
  }

  if (!trade) {
    return notFound();
  }

  const formData = await req.formData();
  const files = formData
    .getAll('screenshots')
    .filter((entry): entry is File => entry instanceof File);

  if (files.length === 0) {
    return NextResponse.json(
      { error: 'Select at least one screenshot file to upload.' },
      { status: 400 },
    );
  }

  for (const file of files) {
    const validation = validateScreenshotCandidate({
      name: file.name,
      type: file.type,
      size: file.size,
    });

    if (!validation.valid) {
      return NextResponse.json(
        {
          error: validation.errors[0] ?? 'Screenshot file is invalid.',
          details: validation.errors,
        },
        { status: 400 },
      );
    }
  }

  const uploadedPaths: string[] = [];

  try {
    for (const file of files) {
      const path = buildTradeScreenshotPath({
        userId: user.id,
        tradeId: trade.id,
        fileName: file.name,
      });
      const { error: uploadError } = await supabase.storage
        .from(JOURNAL_SCREENSHOTS_BUCKET)
        .upload(path, file, {
          contentType: file.type,
          upsert: false,
        });

      if (uploadError) {
        throw new Error(`Failed to upload screenshot: ${uploadError.message}`);
      }

      uploadedPaths.push(path);
    }

    const savedTrade = await saveTradeScreenshotPaths(
      supabase,
      trade.id,
      trade.screenshot_urls,
      uploadedPaths,
    );

    if (!savedTrade) {
      throw new Error('Trade disappeared before screenshot references could be saved.');
    }

    return NextResponse.json({
      ok: true,
      uploaded: uploadedPaths.length,
      screenshot_paths: savedTrade.screenshot_urls,
    });
  } catch (error) {
    if (uploadedPaths.length > 0) {
      await supabase.storage
        .from(JOURNAL_SCREENSHOTS_BUCKET)
        .remove(uploadedPaths);
    }

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'Screenshots could not be uploaded.',
      },
      { status: 500 },
    );
  }
}
