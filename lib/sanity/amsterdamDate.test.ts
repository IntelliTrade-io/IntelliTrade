import { describe, it, expect } from "vitest";
import { amsterdamDateOf } from "@/lib/sanity/amsterdamDate";

describe("amsterdamDateOf", () => {
  it("rolls a late-evening UTC summer time into the next Amsterdam day (CEST, UTC+2)", () => {
    expect(amsterdamDateOf("2026-07-14T22:30:00.000Z")).toBe("2026-07-15");
  });

  it("rolls a late-evening UTC winter time into the next Amsterdam day (CET, UTC+1)", () => {
    expect(amsterdamDateOf("2026-01-10T23:30:00.000Z")).toBe("2026-01-11");
  });

  it("keeps a midday UTC time on the same Amsterdam day", () => {
    expect(amsterdamDateOf("2026-07-15T12:00:00.000Z")).toBe("2026-07-15");
  });

  it("keeps an early-morning UTC time (real publishedAt shape) on the same day", () => {
    expect(amsterdamDateOf("2026-07-14T05:38:00.000Z")).toBe("2026-07-14");
  });
});
