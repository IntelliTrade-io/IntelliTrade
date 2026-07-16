import { describe, it, expect } from "vitest";
import { isInSession, sessionCustomerLabel } from "./sessions";

const d = (iso: string) => new Date(iso);

describe("sessions — boundary membership (winter, London == UTC, NY == UTC-5)", () => {
  it("Asia session: London 00:00 and 06:59", () => {
    expect(isInSession(d("2024-01-15T00:00:00Z"), "ASIA_0000_0659_LDN")).toBe(true);
    expect(isInSession(d("2024-01-15T06:59:00Z"), "ASIA_0000_0659_LDN")).toBe(true);
    expect(isInSession(d("2024-01-15T07:00:00Z"), "ASIA_0000_0659_LDN")).toBe(false);
  });

  it("London open: 07:00 and 10:59", () => {
    expect(isInSession(d("2024-01-15T07:00:00Z"), "LONDON_OPEN_0700_1059_LDN")).toBe(true);
    expect(isInSession(d("2024-01-15T10:59:00Z"), "LONDON_OPEN_0700_1059_LDN")).toBe(true);
    expect(isInSession(d("2024-01-15T11:00:00Z"), "LONDON_OPEN_0700_1059_LDN")).toBe(false);
  });

  it("London midday: 11:00 and 12:59", () => {
    expect(isInSession(d("2024-01-15T11:00:00Z"), "LONDON_MIDDAY_1100_1259_LDN")).toBe(true);
    expect(isInSession(d("2024-01-15T12:59:00Z"), "LONDON_MIDDAY_1100_1259_LDN")).toBe(true);
    expect(isInSession(d("2024-01-15T13:00:00Z"), "LONDON_MIDDAY_1100_1259_LDN")).toBe(false);
  });

  it("NY morning overlap: NY 08:00 (13:00Z) and 11:59 (16:59Z)", () => {
    expect(isInSession(d("2024-01-15T13:00:00Z"), "NY_MORNING_OVERLAP_0800_1159_NY")).toBe(true);
    expect(isInSession(d("2024-01-15T16:59:00Z"), "NY_MORNING_OVERLAP_0800_1159_NY")).toBe(true);
    expect(isInSession(d("2024-01-15T12:59:00Z"), "NY_MORNING_OVERLAP_0800_1159_NY")).toBe(false);
  });

  it("NY afternoon: NY 12:00 (17:00Z) and 16:59 (21:59Z)", () => {
    expect(isInSession(d("2024-01-15T17:00:00Z"), "NY_AFTERNOON_1200_1659_NY")).toBe(true);
    expect(isInSession(d("2024-01-15T21:59:00Z"), "NY_AFTERNOON_1200_1659_NY")).toBe(true);
    expect(isInSession(d("2024-01-15T22:00:00Z"), "NY_AFTERNOON_1200_1659_NY")).toBe(false);
  });
});

describe("sessions — DST correctness (local hour classification stays correct)", () => {
  it("London open shifts with BST: 06:30Z is Asia in winter but London open in summer", () => {
    // Winter: 06:30Z == London 06:30 -> Asia, not open.
    expect(isInSession(d("2024-01-15T06:30:00Z"), "LONDON_OPEN_0700_1059_LDN")).toBe(false);
    // Summer (BST, UTC+1): 06:30Z == London 07:30 -> open.
    expect(isInSession(d("2024-07-15T06:30:00Z"), "LONDON_OPEN_0700_1059_LDN")).toBe(true);
  });

  it("NY morning shifts with EDT: 12:30Z is pre-open in winter but morning overlap in summer", () => {
    // Winter (EST, UTC-5): 12:30Z == NY 07:30 -> before 08:00.
    expect(isInSession(d("2024-01-15T12:30:00Z"), "NY_MORNING_OVERLAP_0800_1159_NY")).toBe(false);
    // Summer (EDT, UTC-4): 12:30Z == NY 08:30 -> morning overlap.
    expect(isInSession(d("2024-07-15T12:30:00Z"), "NY_MORNING_OVERLAP_0800_1159_NY")).toBe(true);
  });
});

describe("sessions — independence and fallback", () => {
  it("each session's membership is computed independently (no forced exclusivity)", () => {
    const londonOpenInstant = d("2024-01-15T09:00:00Z"); // London 09:00, NY 04:00
    expect(isInSession(londonOpenInstant, "LONDON_OPEN_0700_1059_LDN")).toBe(true);
    // The same instant is judged against NY on its own timezone, not excluded by
    // the London match.
    expect(isInSession(londonOpenInstant, "NY_MORNING_OVERLAP_0800_1159_NY")).toBe(false);
  });

  it("DEAD_OTHER matches only timestamps outside all five real sessions", () => {
    // 22:30Z winter: London 22:30, NY 17:30 — outside every defined window.
    expect(isInSession(d("2024-01-15T22:30:00Z"), "DEAD_OTHER")).toBe(true);
    // 03:00Z winter is Asia, so not DEAD_OTHER.
    expect(isInSession(d("2024-01-15T03:00:00Z"), "DEAD_OTHER")).toBe(false);
  });

  it("invalid dates never match", () => {
    expect(isInSession(new Date("nonsense"), "ASIA_0000_0659_LDN")).toBe(false);
  });

  it("customer labels are safe and DEAD_OTHER has none", () => {
    expect(sessionCustomerLabel("ASIA_0000_0659_LDN")).toBe("Asia session");
    expect(sessionCustomerLabel("NY_AFTERNOON_1200_1659_NY")).toBe("New York afternoon");
    expect(sessionCustomerLabel("DEAD_OTHER")).toBe("");
  });
});
