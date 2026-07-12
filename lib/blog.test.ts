import { describe, it, expect } from "vitest";
import { cleanPostTitle, excerptFromPortableText } from "./blog";

describe("cleanPostTitle", () => {
  it("strips the daily-update template suffix", () => {
    expect(
      cleanPostTitle(
        "Oil Risk Cools Slightly, But Dollar Still Has a Floor | Daily Forex Market Update | IntelliTrade"
      )
    ).toBe("Oil Risk Cools Slightly, But Dollar Still Has a Floor");
  });

  it("strips the week-ahead template suffix", () => {
    expect(
      cleanPostTitle(
        "Dollar pause puts Fed minutes and services data in focus | Week Ahead Forex Market Outlook | IntelliTrade"
      )
    ).toBe("Dollar pause puts Fed minutes and services data in focus");
  });

  it("strips a bare brand suffix", () => {
    expect(cleanPostTitle("Some Headline | IntelliTrade")).toBe("Some Headline");
  });

  it("is case-insensitive and whitespace-tolerant", () => {
    expect(cleanPostTitle("Headline |  daily forex market update  |  INTELLITRADE ")).toBe(
      "Headline"
    );
  });

  it("leaves clean titles untouched", () => {
    expect(cleanPostTitle("Dollar resilience and Gulf risk set the tone before U.S. jobs")).toBe(
      "Dollar resilience and Gulf risk set the tone before U.S. jobs"
    );
  });

  it("keeps a legitimate pipe inside a headline", () => {
    expect(cleanPostTitle("Risk on | risk off: reading the tape | Daily Forex Market Update | IntelliTrade")).toBe(
      "Risk on | risk off: reading the tape"
    );
  });

  it("handles null/undefined/empty", () => {
    expect(cleanPostTitle(null)).toBe("");
    expect(cleanPostTitle(undefined)).toBe("");
    expect(cleanPostTitle("")).toBe("");
  });

  it("does not return an empty string when the whole title is template segments", () => {
    // parts.length > 1 guard keeps the last segment
    expect(cleanPostTitle("Daily Forex Market Update | IntelliTrade")).toBe(
      "Daily Forex Market Update"
    );
  });
});

describe("excerptFromPortableText", () => {
  const block = (text: string) => ({
    _type: "block",
    children: [{ _type: "span", text }],
  });

  it("returns the first block when it is short enough", () => {
    expect(excerptFromPortableText([block("Short intro.")])).toBe("Short intro.");
  });

  it("joins blocks until the limit and cuts at a word boundary with an ellipsis", () => {
    const out = excerptFromPortableText(
      [block("The dollar held firm on Tuesday as markets weighed fresh inflation data against a backdrop of elevated oil prices and cautious central bank commentary from both sides of the Atlantic ocean.")],
      80
    );
    expect(out.length).toBeLessThanOrEqual(81);
    expect(out.endsWith("…")).toBe(true);
    expect(out).not.toMatch(/\s…$/);
  });

  it("skips empty and non-block entries", () => {
    const body = [
      { _type: "image", asset: {} },
      block("   "),
      block("Real content here."),
    ];
    expect(excerptFromPortableText(body)).toBe("Real content here.");
  });

  it("handles non-array input", () => {
    expect(excerptFromPortableText(null)).toBe("");
    expect(excerptFromPortableText(undefined)).toBe("");
    expect(excerptFromPortableText("string")).toBe("");
  });
});
