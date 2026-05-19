import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright configuration for Comvi i18n tearing E2E tests.
 *
 * Scope: chromium only (keep CI cost down).
 * Spawns the Next.js dev server on port 3001 for the test run.
 * (Port 2000 = `pnpm dev` default; port 3000 = occupied by Docker on this machine.)
 *
 * Context: packages/react/AUDIT-CONCURRENCY.md — Repro 1 (startTransition +
 * locale flip) and Repro 2 (aborted transition leakage) are indeterminate in
 * happy-dom because happy-dom commits trees atomically and cannot expose
 * mid-commit DOM state. This suite runs in a real Chromium browser where
 * React's concurrent renderer can interleave work and we can poll the live
 * DOM at short intervals to catch pair-inconsistent snapshots.
 */
export default defineConfig({
  testDir: "./e2e",
  testMatch: "**/*.spec.ts",

  /* Maximum time per test */
  timeout: 30_000,
  /* Expect assertions timeout */
  expect: {
    timeout: 10_000,
  },

  /* Do not retry on CI — a tearing failure is a real failure */
  retries: 0,

  /* One worker to keep output readable */
  workers: 1,

  reporter: [["list"], ["html", { open: "never" }]],

  use: {
    baseURL: "http://localhost:3001",
    /* Capture trace on first retry (none here, but keep for future) */
    trace: "on-first-retry",
  },

  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],

  webServer: {
    // Use next directly (not pnpm dev) so we control the port independently
    // of the `dev` script which targets port 2000 for local development.
    // Port 3001 is chosen because 2000 and 3000 are occupied on this machine.
    command: "pnpm exec next dev -p 3001",
    url: "http://localhost:3001",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    stdout: "pipe",
    stderr: "pipe",
  },
});
