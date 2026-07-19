import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

// Security boundary: no client component in the reviews surface may reference the
// service-role key or the service-role client, and no "use client" file may make
// a runtime (value) import from the server-only data layer. The data layer stays
// un-importable from client code (there is no `server-only` package in this repo).
function walk(dir: string): string[] {
  const abs = path.resolve(process.cwd(), dir);
  if (!fs.existsSync(abs)) return [];
  return fs.readdirSync(abs, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return walk(p);
    return e.name.endsWith(".tsx") || e.name.endsWith(".ts") ? [p] : [];
  });
}

const REVIEW_FILES = [
  ...walk("components/strength/reviews"),
  ...walk("app/currency-strength/reviews"),
].filter((f) => !f.endsWith(".test.ts") && !f.endsWith(".test.tsx"));

describe("server-only boundary", () => {
  it("no client component references the service key or admin client", () => {
    for (const file of REVIEW_FILES) {
      const raw = fs.readFileSync(path.resolve(process.cwd(), file), "utf8");
      const isClient = raw.includes('"use client"') || raw.includes("'use client'");
      if (!isClient) continue;
      // Strip comments so their prose can't create false positives.
      const text = raw.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/[^\n]*/g, " ");
      expect(text.includes("SUPABASE_SERVICE_ROLE_KEY"), `${file} leaks service key`).toBe(false);
      expect(text.includes("supabaseAdmin"), `${file} imports supabaseAdmin`).toBe(false);
      // Only type-only imports from the server-only data layer are allowed.
      const valueImport = /import\s+(?!type\b)[^;]*from\s+["']@\/lib\/api\/csmReviews["']/.test(text);
      expect(valueImport, `${file} value-imports the server-only data layer`).toBe(false);
    }
  });

  it("finds the client components it is meant to guard", () => {
    const clientFiles = REVIEW_FILES.filter((f) => {
      const t = fs.readFileSync(path.resolve(process.cwd(), f), "utf8");
      return t.includes('"use client"');
    });
    expect(clientFiles.length).toBeGreaterThanOrEqual(2); // ReviewChart + ReviewArchiveList
  });
});
