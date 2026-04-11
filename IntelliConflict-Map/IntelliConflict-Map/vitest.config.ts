import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": resolve(__dirname, "."),
      "server-only": resolve(__dirname, "tests/server-only.ts")
    }
  },
  test: {
    environment: "node",
    globals: true,
    setupFiles: ["./vitest.setup.ts"]
  }
});
