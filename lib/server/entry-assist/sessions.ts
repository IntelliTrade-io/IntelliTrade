// Entry Assist trading sessions — server-only. Timezone-aware membership via
// native Intl.DateTimeFormat with named timeZone (repo idiom, handles DST). No
// fixed UTC offsets, no date libraries, no new dependencies. London and New York
// windows overlap in absolute time on purpose: each rule checks whether a
// timestamp belongs to ITS required session using that session's own timezone
// and local boundaries. There is no globally exclusive classification.

export type SessionId =
  | "ASIA_0000_0659_LDN"
  | "LONDON_OPEN_0700_1059_LDN"
  | "LONDON_MIDDAY_1100_1259_LDN"
  | "NY_MORNING_OVERLAP_0800_1159_NY"
  | "NY_AFTERNOON_1200_1659_NY"
  | "DEAD_OTHER";

interface SessionDef {
  id: SessionId;
  timeZone: string;
  startHour: number; // inclusive local hour
  endHour: number; // inclusive local hour (window runs to :59:59 of endHour)
  customerLabel: string;
}

// The five real sessions. Windows are whole hours inclusive to :59:59, so an
// integer local-hour comparison is exact (00:00:00-06:59:59 => hours 0..6).
const REAL_SESSIONS: readonly SessionDef[] = [
  { id: "ASIA_0000_0659_LDN", timeZone: "Europe/London", startHour: 0, endHour: 6, customerLabel: "Asia session" },
  { id: "LONDON_OPEN_0700_1059_LDN", timeZone: "Europe/London", startHour: 7, endHour: 10, customerLabel: "London open" },
  { id: "LONDON_MIDDAY_1100_1259_LDN", timeZone: "Europe/London", startHour: 11, endHour: 12, customerLabel: "London midday" },
  { id: "NY_MORNING_OVERLAP_0800_1159_NY", timeZone: "America/New_York", startHour: 8, endHour: 11, customerLabel: "New York morning overlap" },
  { id: "NY_AFTERNOON_1200_1659_NY", timeZone: "America/New_York", startHour: 12, endHour: 16, customerLabel: "New York afternoon" },
] as const;

const REAL_BY_ID = new Map<SessionId, SessionDef>(REAL_SESSIONS.map((s) => [s.id, s]));

// DEAD_OTHER is a fallback tag (outside every defined session). Never customer facing.
const CUSTOMER_LABELS: Record<SessionId, string> = {
  ASIA_0000_0659_LDN: "Asia session",
  LONDON_OPEN_0700_1059_LDN: "London open",
  LONDON_MIDDAY_1100_1259_LDN: "London midday",
  NY_MORNING_OVERLAP_0800_1159_NY: "New York morning overlap",
  NY_AFTERNOON_1200_1659_NY: "New York afternoon",
  DEAD_OTHER: "",
};

/** Local hour (0-23) of `ts` in the named timezone. h23 keeps midnight as 0. */
export function getLocalHour(ts: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    hour: "2-digit",
  }).formatToParts(ts);
  const hour = parts.find((p) => p.type === "hour")?.value ?? "0";
  return Number(hour);
}

function hourInWindow(ts: Date, def: SessionDef): boolean {
  const h = getLocalHour(ts, def.timeZone);
  return h >= def.startHour && h <= def.endHour;
}

/**
 * True when `ts` belongs to `sessionId`'s local window. DEAD_OTHER matches any
 * timestamp that falls outside all five real sessions. Invalid dates never match.
 */
export function isInSession(ts: Date, sessionId: SessionId): boolean {
  if (!(ts instanceof Date) || Number.isNaN(ts.getTime())) return false;
  if (sessionId === "DEAD_OTHER") {
    return !REAL_SESSIONS.some((s) => hourInWindow(ts, s));
  }
  const def = REAL_BY_ID.get(sessionId);
  return def ? hourInWindow(ts, def) : false;
}

export function sessionCustomerLabel(sessionId: SessionId): string {
  return CUSTOMER_LABELS[sessionId] ?? "";
}
