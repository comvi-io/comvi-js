import { defineConfig } from "vitest/config";

// Runs only through `scripts/cli-e2e.mjs`, which boots a real platform API.
export default defineConfig({
  test: {
    environment: "node",
    include: ["e2e/**/*.e2e.test.ts"],
    testTimeout: 120_000,
    hookTimeout: 120_000,
    fileParallelism: false,
  },
});
