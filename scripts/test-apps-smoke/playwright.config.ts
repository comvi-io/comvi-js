import { defineConfig } from "@playwright/test";

/**
 * Driven by `run.mjs`, which builds and serves one Next or Nuxt test app and passes its address in
 * `E2E_BASE_URL` (with the catalog mock's in `E2E_MOCK_URL`). One worker, no retries: a retry
 * would turn a flaky hydration into a green run.
 */
const baseURL = process.env.E2E_BASE_URL;
if (!baseURL) throw new Error("E2E_BASE_URL is not set — run this through `pnpm test-apps:smoke`.");

export default defineConfig({
  testDir: ".",
  testMatch: process.env.E2E_SPEC ?? "next.spec.ts",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  forbidOnly: true,
  timeout: 30_000,
  expect: { timeout: 10_000 },
  outputDir: process.env.E2E_OUTPUT_DIR ?? "test-results",
  reporter: [["line"]],
  use: { baseURL, browserName: "chromium", trace: "retain-on-failure" },
});
