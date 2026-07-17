import { describe, it, expect } from "vitest";
import {
  SESSIONS,
  getSessionState,
  getSessionStates,
  isMarketOpen,
  formatDuration,
} from "./sessions";

const session = (key: string) => SESSIONS.find((s) => s.key === key)!;

describe("getSessionState", () => {
  it("London open on a summer weekday (BST, UTC+1)", () => {
    // 2025-07-16 is a Wednesday. 10:00 UTC = 11:00 BST → within 08:00-17:00.
    const s = getSessionState(new Date("2025-07-16T10:00:00Z"), session("london"));
    expect(s.isOpen).toBe(true);
    expect(s.localTime).toBe("11:00");
  });

  it("London closed before the open (BST)", () => {
    // 05:00 UTC = 06:00 BST → before 08:00 open.
    const s = getSessionState(new Date("2025-07-16T05:00:00Z"), session("london"));
    expect(s.isOpen).toBe(false);
    expect(s.localTime).toBe("06:00");
    // Opens at 08:00 local = 2h away.
    expect(s.minutesUntilChange).toBe(120);
  });

  it("London in winter uses GMT (UTC+0), not a fixed summer offset", () => {
    // 2025-01-15 Wednesday, 09:00 UTC = 09:00 GMT → open, local 09:00.
    const s = getSessionState(new Date("2025-01-15T09:00:00Z"), session("london"));
    expect(s.isOpen).toBe(true);
    expect(s.localTime).toBe("09:00");
  });

  it("New York DST: 13:00 UTC = 09:00 EDT in summer → open", () => {
    const s = getSessionState(new Date("2025-07-16T13:00:00Z"), session("newYork"));
    expect(s.isOpen).toBe(true);
    expect(s.localTime).toBe("09:00");
  });

  it("weekend is closed (Saturday London)", () => {
    // 2025-07-19 is a Saturday.
    const s = getSessionState(new Date("2025-07-19T10:00:00Z"), session("london"));
    expect(s.isOpen).toBe(false);
  });

  it("computes minutes until close when open", () => {
    // London 11:00 BST, closes 17:00 → 6h = 360m.
    const s = getSessionState(new Date("2025-07-16T10:00:00Z"), session("london"));
    expect(s.minutesUntilChange).toBe(360);
  });
});

describe("isMarketOpen", () => {
  it("closed over the weekend across all centres", () => {
    // Saturday 10:00 UTC — no centre in Mon-Fri local business hours.
    expect(isMarketOpen(getSessionStates(new Date("2025-07-19T10:00:00Z")))).toBe(false);
  });

  it("open during the London session", () => {
    expect(isMarketOpen(getSessionStates(new Date("2025-07-16T10:00:00Z")))).toBe(true);
  });
});

describe("formatDuration", () => {
  it("formats hours and minutes", () => {
    expect(formatDuration(135)).toBe("2h 15m");
    expect(formatDuration(45)).toBe("45m");
    expect(formatDuration(0)).toBe("0m");
  });
});
