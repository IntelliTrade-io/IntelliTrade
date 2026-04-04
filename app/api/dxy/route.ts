import { NextResponse } from "next/server";

// ICE U.S. Dollar Index weights
const WEIGHTS: Record<string, number> = {
  EUR: 0.576,
  JPY: 0.136,
  GBP: 0.119,
  CAD: 0.091,
  SEK: 0.042,
  CHF: 0.036,
};
const DXY_MULTIPLIER = 50.14348112;

export async function GET() {
  const apiKey = process.env.NEXT_PUBLIC_CURRENCYFREAKS_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "Missing API key" }, { status: 500 });
  }

  const symbols = Object.keys(WEIGHTS).join(",");
  const res = await fetch(
    `https://api.currencyfreaks.com/v2.0/rates/latest?apikey=${apiKey}&symbols=${symbols}`,
    { next: { revalidate: 300 } }
  );

  if (!res.ok) {
    return NextResponse.json({ error: "Failed to fetch rates" }, { status: 502 });
  }

  const data = await res.json();
  const rates = data.rates as Record<string, string>;

  // DXY = 50.14348112 × EUR^0.576 × JPY^0.136 × GBP^0.119 × CAD^0.091 × SEK^0.042 × CHF^0.036
  // CurrencyFreaks rates are X-per-USD, which maps directly to the formula.
  let dxy = DXY_MULTIPLIER;
  for (const [currency, weight] of Object.entries(WEIGHTS)) {
    const rate = parseFloat(rates[currency]);
    if (!isFinite(rate) || rate <= 0) {
      return NextResponse.json({ error: `Invalid rate for ${currency}` }, { status: 502 });
    }
    dxy *= Math.pow(rate, weight);
  }

  return NextResponse.json({ dxy: Math.round(dxy * 100) / 100 });
}
