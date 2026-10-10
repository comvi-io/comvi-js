import { defineConfig } from "@playwright/test";

/**
 * Driven by `run.mjs`, which serves one built example and passes its address
 * in `E2E_BASE_URL`. Not meant to be run on its own: without the runner there
 * is no server, no temp install and no proof of which `@comvi/*` is under test.
 *
 * One worker and no retries on purpose. The steps share nothing but the server,
 * but a retry would turn a flaky hydration into a green cell, and the console
 * log (step g) is appended to in file order.
 */
const baseURL = process.env.E2E_BASE_URL;
if (!baseURL) {
  throw new Error("E2E_BASE_URL is not set — run this through `pnpm examples:e2e`.");
}

export default defineConfig({
  testDir: ".",
  testMatch: "scenario.spec.ts",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  forbidOnly: true,
  timeout: 30_000,
  expect: { timeout: 10_000 },
  outputDir: process.env.E2E_OUTPUT_DIR ?? "test-results",
  reporter: [["line"], ["json", { outputFile: process.env.E2E_JSON_REPORT ?? "e2e-report.json" }]],
  use: {
    baseURL,
    browserName: "chromium",
    // The five client-only examples pick their starting locale from
    // `navigator.language`; pin it so "the initial render is English" is a
    // property of the example, not of the machine running the suite.
    locale: "en-US",
    trace: "retain-on-failure",
  },
});
