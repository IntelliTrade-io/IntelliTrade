// Security regression check (refactor plan 7.3): the public anon key must NOT
// be able to read premium tables directly via PostgREST. Regression guard for
// audit finding C1 — if RLS or a grant is ever loosened, this fails CI.
//
// Self-skips (exit 0) when creds are absent, so the check is inert until the
// owner adds SUPABASE_URL + SUPABASE_ANON_KEY as GitHub Actions secrets. It is
// only meaningful against the real (production) project.

const URL_ENV = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// Reader tables that must never be anon-readable (from migration 005).
const PREMIUM_TABLES = [
  "broker_feeds",
  "symbol_mapping",
  "scanner_health",
  "fx_strength_snapshots",
  "fx_strength_components",
  "fx_candles",
  "market_candles",
  "sr_zones",
  "sr_opportunities",
  "conflict_cache",
  "scanner_results",
  "currency_strength_snapshots",
  "economic_events",
];

if (!URL_ENV || !ANON) {
  console.log(
    "anon-rls-check: SKIPPED — set SUPABASE_URL + SUPABASE_ANON_KEY secrets to enable.",
  );
  process.exit(0);
}

const base = URL_ENV.replace(/\/+$/, "");

async function probe(table) {
  const res = await fetch(`${base}/rest/v1/${table}?select=*&limit=1`, {
    headers: { apikey: ANON, Authorization: `Bearer ${ANON}` },
  });

  // A 4xx (401/403 permission denied) is the expected, safe outcome.
  if (res.status >= 400) {
    return { table, ok: true, detail: `denied ${res.status}` };
  }

  // A 200 is only safe if RLS returns an empty set. Any row = data leak.
  let body;
  try {
    body = await res.json();
  } catch {
    body = null;
  }
  const leaked = Array.isArray(body) && body.length > 0;
  return {
    table,
    ok: !leaked,
    detail: leaked ? `LEAKED ${body.length} row(s) at status ${res.status}` : `empty ${res.status}`,
  };
}

const results = await Promise.all(PREMIUM_TABLES.map(probe));
const failures = results.filter((r) => !r.ok);

for (const r of results) {
  console.log(`${r.ok ? "PASS" : "FAIL"}  ${r.table}  (${r.detail})`);
}

if (failures.length > 0) {
  console.error(
    `\nanon-rls-check FAILED: ${failures.length} premium table(s) readable with the anon key.`,
  );
  process.exit(1);
}

console.log(`\nanon-rls-check: all ${results.length} premium tables denied to anon. OK.`);
