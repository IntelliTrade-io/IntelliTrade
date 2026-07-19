import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import * as copy from "@/lib/strength-reviews-copy";

// Customer-facing review copy is analytics language only (legal + Google). No em
// dashes and none of these terms anywhere a customer can read them. The
// educational disclaimer is the single sanctioned use of "buy"/"sell" (it
// negates them) and is excluded from the term scan.
const FORBIDDEN = [
  "signal", "entry signal", "buy", "sell", "guaranteed", "high probability trade",
  "profit", "trade result", "stop loss", "take profit", "r multiple",
  "backtested edge", "winning trade", "losing trade",
];

const EM_DASH = "—";

function copyStrings(): string[] {
  const out: string[] = [];
  for (const value of Object.values(copy)) {
    if (typeof value === "string") out.push(value);
    else if (Array.isArray(value)) {
      for (const item of value) {
        if (item && typeof item === "object") {
          out.push(String((item as { heading?: string }).heading ?? ""));
          out.push(String((item as { body?: string }).body ?? ""));
        }
      }
    }
  }
  return out;
}

describe("review copy constants", () => {
  it("contain no em dashes", () => {
    for (const s of copyStrings()) {
      expect(s.includes(EM_DASH), `em dash in: ${s}`).toBe(false);
    }
  });

  it("contain no forbidden trading terms (educational disclaimer excepted)", () => {
    for (const s of copyStrings()) {
      const scan = s === copy.REVIEW_EDUCATIONAL_NOTE ? "" : s.toLowerCase();
      for (const term of FORBIDDEN) {
        const re = new RegExp(`\\b${term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`);
        expect(re.test(scan), `forbidden "${term}" in: ${s}`).toBe(false);
      }
    }
  });

  it("the educational note only uses buy/sell to disclaim", () => {
    expect(copy.REVIEW_EDUCATIONAL_NOTE.toLowerCase()).toContain("not a buy or sell instruction");
  });
});

describe("review UI source files", () => {
  const files = [
    "components/strength/reviews/ReviewMetrics.tsx",
    "components/strength/reviews/ReviewLadder.tsx",
    "components/strength/reviews/ReviewArchiveList.tsx",
    "components/strength/reviews/ReviewChart.tsx",
  ].map((f) => ({ name: f, text: fs.readFileSync(path.resolve(process.cwd(), f), "utf8") }));

  it("contain no em dashes in source", () => {
    for (const { name, text } of files) {
      expect(text.includes(EM_DASH), `em dash in ${name}`).toBe(false);
    }
  });
});
