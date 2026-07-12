// Safe JSON-LD serialization for <script type="application/ld+json"> tags
// (audit L14). Plain JSON.stringify can emit a literal "</script>" if any
// string value contains it (e.g. CMS-authored blog fields), breaking out of
// the script element. Escaping "<" to its < unicode form is valid JSON
// and neutralizes </script>, <!--, and <script breakout without changing the
// parsed data.
export function jsonLd(data: unknown): string {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}
