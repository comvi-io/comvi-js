import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./gate-e",
  testMatch: "**/*.spec.ts",
  testIgnore: "**/system-platform.spec.ts",
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  // Security-boundary flakes must fail immediately; JSON still records timing.
  retries: 0,
  workers: 1,
  reporter: process.env.CI
    ? [
        ["line"],
        ["html", { open: "never" }],
        ["json", { outputFile: "test-results/results.json" }],
        ["junit", { outputFile: "test-results/results.xml" }],
      ]
    : "line",
  timeout: 45_000,
  use: {
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: {
    command: "pnpm gate-e:serve",
    url: "http://127.0.0.1:8791/__log",
    reuseExistingServer: !process.env.CI,
    timeout: 15_000,
  },
});
