import { NextResponse } from "next/server";

export async function GET() {
  const apiKey = process.env.FRED_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "Missing FRED_API_KEY" }, { status: 500 });
  }

  const res = await fetch(
    `https://api.stlouisfed.org/fred/series/observations?series_id=DGS10&api_key=${apiKey}&sort_order=desc&limit=1&file_type=json`,
    { next: { revalidate: 3600 } }
  );

  if (!res.ok) {
    return NextResponse.json({ error: "FRED request failed" }, { status: 502 });
  }

  const data = await res.json();
  const raw = data.observations?.[0]?.value as string | undefined;

  // FRED returns "." when data isn't released yet (weekends/holidays)
  if (!raw || raw === ".") {
    return NextResponse.json({ yield: null });
  }

  const value = parseFloat(raw);
  return NextResponse.json({ yield: isFinite(value) ? value : null });
}
