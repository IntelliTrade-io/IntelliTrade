import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  // Match Next's automatic JSX runtime so component modules that don't import
  // React (the app convention) can be imported/rendered in tests.
  esbuild: { jsx: "automatic" },
  test: {
    environment: "node",
    include: ["**/__tests__/**/*.test.ts", "**/*.test.ts"],
    // claudeLoad holds session artifacts incl. donor codebases with their own
    // test suites and bundled node_modules — never part of this app's suite.
    exclude: ["**/node_modules/**", "**/.next*/**", "IntelliConflict-Map/**", "claudeLoad/**"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
});
