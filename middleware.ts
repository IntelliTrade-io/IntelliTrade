import { updateSession } from "@/lib/supabase/middleware";
import { type NextRequest } from "next/server";

export async function middleware(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  // Excluded = public, no auth: static assets, API routes (they self-gate via
  // lib/auth/requireSubscription), and the free tier — blog, lot size
  // calculator, prices-today pages, legal/marketing. Everything NOT excluded
  // runs through middleware: login required, and premium surfaces additionally
  // require an active subscription (see lib/supabase/middleware.ts).
  // NOTE: .json exclusion must stay AFTER data/current removal considerations —
  // /data/current/*.json is matched by the extension exclusion, so that API
  // relies on its own requireSubscription check, not middleware.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|ads.txt|app-ads.txt|.*\\.(?:svg|png|jpg|jpeg|gif|webp|json|txt|xml|webmanifest)$|lotsizecalculator|pipvaluecalculator|margincalculator|compoundingcalculator|forex-market-hours|api|blog|privacyStatement|cookieStatement|upgrade|termsOfService|about|pro|smart-support-zones|economic-calendar|currency-strength|gold-price-today|silver-price-today|oil-price-today|bitcoin-price-today|data/current).*)",
  ],
};
