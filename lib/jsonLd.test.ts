import { describe, it, expect } from "vitest";
import { jsonLd } from "./jsonLd";

describe("jsonLd", () => {
  it("escapes < so a </script> in a value cannot break out of the tag", () => {
    const out = jsonLd({ title: "a</script><script>alert(1)</script>b" });
    expect(out.includes("</script>")).toBe(false);
    expect(out.includes("<")).toBe(false);
    expect(out.includes("\\u003c")).toBe(true);
  });

  it("preserves the data — the escaped output parses back to the original", () => {
    const data = { headline: "5 < 10 & </script> tricks", n: 3, nested: { a: ["<x>"] } };
    expect(JSON.parse(jsonLd(data))).toEqual(data);
  });

  it("leaves breakout-free content otherwise identical to JSON.stringify", () => {
    const data = { "@type": "Article", name: "Gold price today" };
    expect(jsonLd(data)).toBe(JSON.stringify(data));
  });
});
