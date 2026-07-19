import { NextResponse } from "next/server";
import { getTenYearYield } from "@/lib/api/marketServer";

// Thin wrapper for client-side refreshes: the FRED fetch (and its 1h upstream
// cache) lives in lib/api/marketServer.ts, shared with the server-rendered
// price pages. `yield: null` covers both "not yet released" and upstream
// failure — clients render a fallback either way.
export async function GET() {
  return NextResponse.json({ yield: await getTenYearYield() });
}
