// Off-box scanner watchdog (IMPROVEMENTS "CSM data-freshness surfacing", ops
// fix from the 2026-07-07 outage): the VPS-resident watchdog dies with the VPS,
// so a scheduled GitHub Action reads scanner_health and fails loudly when a
// scanner has not reported in too long. A failed scheduled run triggers
// GitHub's workflow-failure email.
//
// Staleness is measured in MARKET-OPEN time: forex closes Friday 21:00 UTC and
// reopens Sunday 21:00 UTC, and the scanners idle over the weekend. Counting
// wall-clock hours would false-alarm every Monday morning.
//
// Self-skips (exit 0) when creds are absent, same pattern as anon-rls-check.

const URL_ENV = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Max age of the newest row per timeframe group, in market-open hours. Looser
// than the on-box watchdog (30m / 5h): this one only needs to catch "the VPS
// or a scanner family is down", not a single slow cycle.
const MAX_OPEN_HOURS = {
  H1_M15: 2,
  D1_H4: 8,
};

/** Seconds between `from` and `to` that fall inside forex market hours
 *  (open Sunday 21:00 UTC through Friday 21:00 UTC). */
export function openSecondsBetween(from, to) {
  const DAY = 86_400_000;
  let open = 0;
  // Walk in day-sized steps, clipping each step against the closed window.
  for (let t = from.getTime(); t < to.getTime(); ) {
    const stepEnd = Math.min(t + DAY, to.getTime());
    const mid = new Date(t);
    const dow = mid.getUTCDay(); // 0 Sun .. 6 Sat
    const secondsOfDay = (t - Date.UTC(mid.getUTCFullYear(), mid.getUTCMonth(), mid.getUTCDate())) / 1000;
    // Closed: Fri >= 21:00, all Sat, Sun < 21:00.
    const closed =
      (dow === 5 && secondsOfDay >= 21 * 3600) ||
      dow === 6 ||
      (dow === 0 && secondsOfDay < 21 * 3600);
    // Find the next boundary (21:00 UTC of the current day, or midnight).
    const midnight = Date.UTC(mid.getUTCFullYear(), mid.getUTCMonth(), mid.getUTCDate()) + DAY;
    const boundary21 = Date.UTC(mid.getUTCFullYear(), mid.getUTCMonth(), mid.getUTCDate()) + 21 * 3600 * 1000;
    let next = midnight;
    if ((dow === 5 || dow === 0) && t < boundary21) next = boundary21;
    next = Math.min(next, stepEnd);
    if (!closed) open += (next - t) / 1000;
    t = next;
  }
  return open;
}

if (!URL_ENV || !SERVICE_KEY) {
  console.log("scanner-health-check: SKIPPED — set SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY to enable.");
  process.exit(0);
}

const base = URL_ENV.replace(/\/+$/, "");

const res = await fetch(
  `${base}/rest/v1/scanner_health?select=scanner_name,timeframe_group,status,last_error,updated_at`,
  { headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` } },
);
if (!res.ok) {
  console.error(`scanner-health-check FAILED: PostgREST ${res.status} ${await res.text()}`);
  process.exit(1);
}
const rows = await res.json();

if (!Array.isArray(rows) || rows.length === 0) {
  console.error("scanner-health-check FAILED: scanner_health has no rows at all.");
  process.exit(1);
}

const now = new Date();
const issues = [];

for (const [group, maxHours] of Object.entries(MAX_OPEN_HOURS)) {
  const groupRows = rows.filter((r) => r.timeframe_group === group);
  if (groupRows.length === 0) {
    issues.push(`[${group}] no scanner_health rows for this timeframe group`);
    continue;
  }
  // Newest row per group — the group is healthy if ANY scanner in it reported
  // recently (feed failover writes under a different scanner_name).
  const newest = groupRows.reduce((a, b) =>
    new Date(a.updated_at) > new Date(b.updated_at) ? a : b,
  );
  const openHours = openSecondsBetween(new Date(newest.updated_at), now) / 3600;
  const label = `${newest.scanner_name}/${group}`;
  console.log(`${label}: last update ${newest.updated_at} (${openHours.toFixed(1)} market-open hours ago), status=${newest.status}`);
  if (openHours > maxHours) {
    issues.push(`[${label}] STALE — ${openHours.toFixed(1)} market-open hours since last update (max ${maxHours}h)${newest.last_error ? ` — last_error: ${newest.last_error}` : ""}`);
  }
}

if (issues.length > 0) {
  console.error(`\nscanner-health-check FAILED:\n${issues.map((i) => `  - ${i}`).join("\n")}`);
  process.exit(1);
}

console.log("\nscanner-health-check: all scanner groups fresh. OK.");
