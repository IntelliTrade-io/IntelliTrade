import { updateSession } from "@/lib/supabase/middleware";
import { type NextRequest } from "next/server";

export async function middleware(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|ads.txt|app-ads.txt|.*\\.(?:svg|png|jpg|jpeg|gif|webp|json|txt|xml)$|lotsizecalculator|api|blog|privacyStatement|cookieStatement|dashboard(?!v2)|upgrade|termsOfService|about|gold-price-today|silver-price-today|oil-price-today|bitcoin-price-today|currency-strength-meter|currency-strength-meter-intraday|data/current|conflict-map).*)",
  ],
};
