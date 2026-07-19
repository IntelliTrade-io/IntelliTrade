import { NextResponse } from "next/server";
import { getDxy } from "@/lib/api/marketServer";

// Thin wrapper for client-side refreshes: the DXY computation (and its 300s
// upstream cache) lives in lib/api/marketServer.ts, shared with the server-
// rendered price pages.
export async function GET() {
  const dxy = await getDxy();
  if (dxy === null) {
    return NextResponse.json({ error: "DXY unavailable" }, { status: 502 });
  }
  return NextResponse.json({ dxy });
}
