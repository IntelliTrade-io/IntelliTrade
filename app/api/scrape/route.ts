import { NextRequest, NextResponse } from 'next/server';
import { spawn } from 'child_process';
import path from 'path';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

// Ops/cron trigger, not user-facing: spawns a Python scraper. Gate on a shared
// secret so an unauthenticated visitor can't kick off heavy jobs (audit M10).
function isAuthorized(request: NextRequest): boolean {
  const secret = process.env.SCRAPE_SECRET;
  if (!secret) return false; // fail closed if not configured
  const header = request.headers.get('authorization');
  return header === `Bearer ${secret}`;
}

// Whitelist argv: `since`/`until` are day offsets (non-negative ints), the flags
// are strict booleans. Prevents unvalidated values flowing into spawn() (audit M10).
function intArg(value: string | null, fallback: string): string {
  if (value === null) return fallback;
  return /^\d{1,5}$/.test(value) ? value : fallback;
}
function boolArg(value: string | null, fallback: string): string {
  if (value === null) return fallback;
  return value === 'true' || value === 'false' ? value : fallback;
}

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    const searchParams = request.nextUrl.searchParams;
    const since = intArg(searchParams.get('since'), '0');
    const until = intArg(searchParams.get('until'), '30');
    const central_banks = boolArg(searchParams.get('central_banks'), 'true');
    const include_global = boolArg(searchParams.get('global'), 'true');

    // Call Python script
    const pythonPath = process.env.PYTHON_PATH || 'python3';
    const scriptPath = path.join(process.cwd(), 'scraper', 'cli.py');

    const result = await new Promise<string>((resolve, reject) => {
      const python = spawn(pythonPath, [
        scriptPath,
        '--since', since,
        '--until', until,
        '--central-banks', central_banks,
        '--global', include_global,
        '--json'
      ]);

      let output = '';
      let errorOutput = '';

      python.stdout.on('data', (data) => {
        output += data.toString();
      });

      python.stderr.on('data', (data) => {
        errorOutput += data.toString();
      });

      python.on('close', (code) => {
        if (code !== 0) {
          reject(new Error(`Python script failed: ${errorOutput}`));
        } else {
          resolve(output);
        }
      });
    });

    const events = JSON.parse(result);
    
    return NextResponse.json(events, {
      headers: {
        'Cache-Control': 'no-store, max-age=0',
      },
    });
  } catch (error) {
    console.error('Scrape error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}