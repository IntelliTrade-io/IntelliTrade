import { NextRequest, NextResponse } from "next/server";

// Server-side proxy for CurrencyFreaks so the paid API key never reaches the
// browser (audit H7 — it was previously NEXT_PUBLIC_ and extractable from any
// visitor's network tab). Response shape matches the upstream `rates/latest`
// endpoint ({ rates: { SYM: "1.2345" } }), so clients only swap the URL.

// Closed set: exactly the symbols the app requests (price pages, lot size
// calculator pairs, DXY basket). A closed set — instead of any 3-4 letter
// code — stops abusers from generating endless symbol combinations, where
// each new combination bypasses the 60s cache and burns paid upstream quota.
const ALLOWED_SYMBOLS = new Set([
  "USD", "EUR", "GBP", "JPY", "CHF", "CAD", "AUD", "NZD", "SEK",
  "XAU", "XAG", "BTC", "ETH",
]);

function isAllowedSymbolList(symbols: string): boolean {
  const parts = symbols.split(",");
  if (parts.length === 0 || parts.length > 10) return false;
  return parts.every((s) => ALLOWED_SYMBOLS.has(s));
}

// Upstream responses are cached for 60s per symbol set: page quotes refresh on
// a timer per visitor, and without this every visitor's poll would burn paid
// API quota.
const UPSTREAM_REVALIDATE_SECONDS = 60;

export async function GET(request: NextRequest) {
  // Prefer the server-only var; fall back to the legacy public one so the
  // route keeps working until the env rename + key rotation is done in Vercel.
  const apiKey =
    process.env.CURRENCYFREAKS_API_KEY ??
    process.env.NEXT_PUBLIC_CURRENCYFREAKS_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "Rates unavailable" }, { status: 503 });
  }

  const symbols = request.nextUrl.searchParams.get("symbols") ?? "";
  if (!isAllowedSymbolList(symbols)) {
    return NextResponse.json({ error: "Invalid symbols" }, { status: 400 });
  }

  const res = await fetch(
    `https://api.currencyfreaks.com/v2.0/rates/latest?apikey=${apiKey}&symbols=${symbols}`,
    { next: { revalidate: UPSTREAM_REVALIDATE_SECONDS } },
  );
  if (!res.ok) {
    return NextResponse.json({ error: "Failed to fetch rates" }, { status: 502 });
  }

  const data = await res.json();
  return NextResponse.json(
    { rates: data.rates ?? {} },
    { headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=30" } },
  );
}
