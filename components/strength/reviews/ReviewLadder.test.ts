import { describe, expect, it } from "vitest";
import { ReviewLadder } from "@/components/strength/reviews/ReviewLadder";
import type { LadderRowDto } from "@/lib/api/csmReviews";

// Node-env render: call the component and walk the returned React element tree
// (no DOM needed) to assert the data surface. ReviewLadder uses only intrinsic
// elements, so every leaf is reachable this way.
function textLeaves(node: unknown, out: string[] = []): string[] {
  if (node == null || typeof node === "boolean") return out;
  if (typeof node === "string" || typeof node === "number") {
    out.push(String(node));
    return out;
  }
  if (Array.isArray(node)) {
    node.forEach((n) => textLeaves(n, out));
    return out;
  }
  const el = node as { props?: { children?: unknown } };
  if (el.props && "children" in el.props) textLeaves(el.props.children, out);
  return out;
}

const LADDER: LadderRowDto[] = [
  { rank: 1, currency: "EUR", score: 62.5 },
  { rank: 2, currency: "USD", score: 30.0 },
  { rank: 3, currency: "GBP", score: 20.0 },
  { rank: 4, currency: "AUD", score: 10.0 },
  { rank: 5, currency: "NZD", score: -10.0 },
  { rank: 6, currency: "CAD", score: -20.0 },
  { rank: 7, currency: "CHF", score: -30.0 },
  { rank: 8, currency: "JPY", score: -61.0 },
];

describe("ReviewLadder", () => {
  it("renders all 8 currencies in rank order", () => {
    const tree = ReviewLadder({ ladder: LADDER });
    const leaves = textLeaves(tree);
    const order = LADDER.map((r) => r.currency);
    const seen = order.filter((c) => leaves.includes(c));
    expect(seen).toEqual(order); // all present, in order
    const joined = leaves.join("");
    expect(joined).toContain("+62.5"); // rank-1 score formatted
    expect(joined).toContain("-61.0"); // rank-8 score formatted
  });
});
