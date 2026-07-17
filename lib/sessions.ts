// Forex trading-session logic for the market-hours clock. DST-correct: session
// hours are defined in each financial centre's local time and evaluated via the
// IANA timezone (Intl), so London/New York/Sydney shift automatically across
// their daylight-saving changes. Pure — takes `now` as a parameter so it is
// testable and has no hidden clock dependency.
//
// Hours are the commonly-cited market-centre business hours (08:00-17:00 local,
// Tokyo 09:00-18:00). Conventions differ by an hour between sources; the page
// states this. A session is considered open on its local weekdays (Mon-Fri)
// within those hours, which also yields the correct weekly open (Sydney Monday)
// and close (New York Friday).

export interface SessionDef {
  key: string;
  label: string;
  city: string;
  timeZone: string;
  /** Local opening time, minutes from midnight. */
  openMin: number;
  /** Local closing time, minutes from midnight. */
  closeMin: number;
  /** Accent RGB for the UI. */
  accent: [number, number, number];
}

const H = (hours: number) => hours * 60;

export const SESSIONS: SessionDef[] = [
  { key: "sydney", label: "Sydney", city: "Sydney", timeZone: "Australia/Sydney", openMin: H(8), closeMin: H(17), accent: [56, 189, 248] },
  { key: "tokyo", label: "Tokyo", city: "Tokyo", timeZone: "Asia/Tokyo", openMin: H(9), closeMin: H(18), accent: [244, 114, 182] },
  { key: "london", label: "London", city: "London", timeZone: "Europe/London", openMin: H(8), closeMin: H(17), accent: [251, 191, 36] },
  { key: "newYork", label: "New York", city: "New York", timeZone: "America/New_York", openMin: H(8), closeMin: H(17), accent: [52, 211, 153] },
];

const WEEKDAY_INDEX: Record<string, number> = {
  Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6,
};

const MINUTES_PER_WEEK = 7 * 24 * 60;

/** Local wall-clock parts of `now` in a given IANA timezone. */
function localParts(now: Date, timeZone: string): { weekdayIdx: number; hour: number; minute: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);

  let weekday = "Mon";
  let hour = 0;
  let minute = 0;
  for (const p of parts) {
    if (p.type === "weekday") weekday = p.value;
    else if (p.type === "hour") hour = parseInt(p.value, 10);
    else if (p.type === "minute") minute = parseInt(p.value, 10);
  }
  return { weekdayIdx: WEEKDAY_INDEX[weekday] ?? 0, hour, minute };
}

export interface SessionState {
  key: string;
  label: string;
  city: string;
  accent: [number, number, number];
  isOpen: boolean;
  /** Local time in the session's timezone, "HH:MM". */
  localTime: string;
  /** Minutes until the next open (if closed) or close (if open). */
  minutesUntilChange: number;
}

/**
 * Boundary minutes-of-week (Mon 00:00 = 0) for every open and close edge across
 * the trading week, used to find the next transition.
 */
function boundaryMinutes(session: SessionDef): number[] {
  const edges: number[] = [];
  for (let day = 0; day < 5; day++) {
    edges.push(day * 1440 + session.openMin);
    edges.push(day * 1440 + session.closeMin);
  }
  return edges.sort((a, b) => a - b);
}

export function getSessionState(now: Date, session: SessionDef): SessionState {
  const { weekdayIdx, hour, minute } = localParts(now, session.timeZone);
  const minuteOfDay = hour * 60 + minute;
  const isWeekday = weekdayIdx <= 4;
  const isOpen = isWeekday && minuteOfDay >= session.openMin && minuteOfDay < session.closeMin;

  const nowMinOfWeek = weekdayIdx * 1440 + minuteOfDay;
  const edges = boundaryMinutes(session);
  let next = edges.find((e) => e > nowMinOfWeek);
  // Wrap into next week (add the weekend gap) if past the last Friday edge.
  if (next === undefined) next = edges[0]! + MINUTES_PER_WEEK;
  const minutesUntilChange = next - nowMinOfWeek;

  return {
    key: session.key,
    label: session.label,
    city: session.city,
    accent: session.accent,
    isOpen,
    localTime: `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`,
    minutesUntilChange,
  };
}

export function getSessionStates(now: Date): SessionState[] {
  return SESSIONS.map((s) => getSessionState(now, s));
}

/** Whether the forex market as a whole is open (any centre open). */
export function isMarketOpen(states: SessionState[]): boolean {
  return states.some((s) => s.isOpen);
}

/** "2h 15m" / "45m" from a minute count. */
export function formatDuration(minutes: number): string {
  const m = Math.max(0, Math.round(minutes));
  const h = Math.floor(m / 60);
  const rem = m % 60;
  if (h === 0) return `${rem}m`;
  return `${h}h ${rem}m`;
}
