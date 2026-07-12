import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./gate-e",
  testMatch: "**/system-platform.spec.ts",
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  // Cross-repository security failures must not become green after a retry.
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
  timeout: 90_000,
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
