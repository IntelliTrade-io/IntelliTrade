import { describe, it, expect } from "vitest";
import {
  dateInTz,
  todayInTz,
  weekRangeInTz,
  upcomingEnd,
  toImpactLevel,
  toCalendarEvent,
  buildListItems,
  matchesDateFilter,
  type ApiEvent,
} from "./calendar";

const TZ = "Europe/Amsterdam";
// Wednesday 2026-07-01 12:00 UTC (14:00 in Amsterdam, CEST)
const NOW = new Date("2026-07-01T12:00:00Z");

function apiEvent(overrides: Partial<ApiEvent> = {}): ApiEvent {
  return {
    id: 1,
    title: "CPI YoY",
    country: "US",
    date_time_utc: "2026-07-01T12:30:00Z",
    impact: "High",
    ...overrides,
  };
}

describe("timezone date math", () => {
  it("dateInTz rolls an evening UTC timestamp into the next local day", () => {
    // 23:30 UTC = 01:30 next day in Amsterdam (CEST, UTC+2)
    expect(dateInTz("2026-07-01T23:30:00Z", TZ)).toBe("2026-07-02");
    expect(dateInTz("2026-07-01T23:30:00Z", "America/New_York")).toBe("2026-07-01");
  });

  it("todayInTz formats the injected now", () => {
    expect(todayInTz(TZ, NOW)).toBe("2026-07-01");
  });

  it("weekRangeInTz returns Monday..Sunday around now", () => {
    expect(weekRangeInTz(0, TZ, NOW)).toEqual({ start: "2026-06-29", end: "2026-07-05" });
    expect(weekRangeInTz(1, TZ, NOW)).toEqual({ start: "2026-07-06", end: "2026-07-12" });
  });

  it("weekRangeInTz treats Sunday as end of the current week", () => {
    const sunday = new Date("2026-07-05T10:00:00Z");
    expect(weekRangeInTz(0, TZ, sunday)).toEqual({ start: "2026-06-29", end: "2026-07-05" });
  });

  it("upcomingEnd is 30 days out", () => {
    expect(upcomingEnd(NOW)).toBe("2026-07-31");
  });
});

describe("toImpactLevel", () => {
  it("maps both cases and defaults unknown to low", () => {
    expect(toImpactLevel("High")).toBe("high");
    expect(toImpactLevel("medium")).toBe("medium");
    expect(toImpactLevel("whatever")).toBe("low");
  });
});

describe("toCalendarEvent", () => {
  it("maps country to currency, region, and flag", () => {
    const ev = toCalendarEvent(apiEvent({ country: "GB" }), TZ);
    expect(ev.currency).toBe("GBP");
    expect(ev.region).toBe("United Kingdom");
    expect(ev.flagCode).toBe("gb");
  });

  it("falls back to the raw country code when unmapped and EU when absent", () => {
    expect(toCalendarEvent(apiEvent({ country: "XX" }), TZ).currency).toBe("XX");
    expect(toCalendarEvent(apiEvent({ country: undefined }), TZ).currency).toBe("EUR");
  });

  it("prefers top-level source_url over extras and raw url", () => {
    const ev = toCalendarEvent(
      apiEvent({ source_url: "https://a", url: "https://c", extras: { source_url_standardized: "https://b" } }),
      TZ,
    );
    expect(ev.extras.source_url_standardized).toBe("https://a");
  });
});

describe("buildListItems", () => {
  const base = (id: string, iso: string) => toCalendarEvent(apiEvent({ id, date_time_utc: iso }), TZ);

  it("groups pmi_cluster events and takes highest impact + earliest time", () => {
    const a = { ...base("1", "2026-07-01T10:00:00Z"), eventGroupType: "pmi_cluster", eventGroupKey: "pmi-jul", impact: "low" as const };
    const b = { ...base("2", "2026-07-01T08:00:00Z"), eventGroupType: "pmi_cluster", eventGroupKey: "pmi-jul", impact: "high" as const };
    const solo = base("3", "2026-07-01T09:00:00Z");

    const items = buildListItems([a, b, solo]);
    expect(items).toHaveLength(2);
    const cluster = items.find((i) => i.type === "cluster");
    expect(cluster && cluster.type === "cluster" && cluster.cluster.highestImpact).toBe("high");
    // cluster's first event (08:00) sorts before the 09:00 standalone
    expect(items[0].type).toBe("cluster");
  });

  it("keeps non-cluster events standalone and time-sorted", () => {
    const late = base("1", "2026-07-01T15:00:00Z");
    const early = base("2", "2026-07-01T06:00:00Z");
    const items = buildListItems([late, early]);
    expect(items.map((i) => i.type === "event" && i.event.id)).toEqual(["2", "1"]);
  });
});

describe("matchesDateFilter", () => {
  it("today matches only the local calendar day", () => {
    expect(matchesDateFilter("2026-07-01T08:00:00Z", "today", TZ, NOW)).toBe(true);
    // 23:00 UTC is 01:00 July 2 in Amsterdam — not today
    expect(matchesDateFilter("2026-07-01T23:00:00Z", "today", TZ, NOW)).toBe(false);
  });

  it("this_week and next_week use Monday-based ranges", () => {
    expect(matchesDateFilter("2026-07-05T10:00:00Z", "this_week", TZ, NOW)).toBe(true);
    expect(matchesDateFilter("2026-07-06T10:00:00Z", "this_week", TZ, NOW)).toBe(false);
    expect(matchesDateFilter("2026-07-06T10:00:00Z", "next_week", TZ, NOW)).toBe(true);
  });

  it("upcoming spans today through +30 days", () => {
    expect(matchesDateFilter("2026-06-30T10:00:00Z", "upcoming", TZ, NOW)).toBe(false);
    expect(matchesDateFilter("2026-07-31T10:00:00Z", "upcoming", TZ, NOW)).toBe(true);
    expect(matchesDateFilter("2026-08-01T10:00:00Z", "upcoming", TZ, NOW)).toBe(false);
  });
});
