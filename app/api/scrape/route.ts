import { NextRequest, NextResponse } from 'next/server';
import { spawn } from 'child_process';
import path from 'path';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const since = searchParams.get('since') || '0';
    const until = searchParams.get('until') || '30';
    const central_banks = searchParams.get('central_banks') || 'true';
    const include_global = searchParams.get('global') || 'true';

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