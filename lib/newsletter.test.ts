import { describe, it, expect } from "vitest";
import { normalizeEmail, normalizeSource } from "./newsletter";

describe("normalizeEmail", () => {
  it("trims and lowercases valid addresses", () => {
    expect(normalizeEmail("  Trader@Example.COM ")).toBe("trader@example.com");
  });

  it("rejects non-strings and junk", () => {
    expect(normalizeEmail(undefined)).toBeNull();
    expect(normalizeEmail(42)).toBeNull();
    expect(normalizeEmail("")).toBeNull();
    expect(normalizeEmail("not-an-email")).toBeNull();
    expect(normalizeEmail("a@b")).toBeNull(); // no TLD
    expect(normalizeEmail("a b@c.com")).toBeNull(); // whitespace
    expect(normalizeEmail("a@b.c")).toBeNull(); // 1-char TLD
  });

  it("enforces length bounds", () => {
    expect(normalizeEmail("a@b.co")).toBe("a@b.co"); // 6 chars, minimum
    expect(normalizeEmail(`${"x".repeat(250)}@b.co`)).toBeNull(); // > 254
  });
});

describe("normalizeSource", () => {
  it("passes known sources through", () => {
    expect(normalizeSource("currency-strength")).toBe("currency-strength");
    expect(normalizeSource("blog")).toBe("blog");
  });

  it("coerces anything else to 'other'", () => {
    expect(normalizeSource("dashboard'); DROP TABLE--")).toBe("other");
    expect(normalizeSource(undefined)).toBe("other");
    expect(normalizeSource(9)).toBe("other");
  });
});
