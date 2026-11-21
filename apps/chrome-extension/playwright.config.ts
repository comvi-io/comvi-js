import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./gate-e",
  testMatch: "**/*.spec.ts",
  // The real-platform gate and the plain-page checks (playwright.engines.config.ts) have
  // configs of their own.
  testIgnore: ["**/system-platform.spec.ts", "**/layout-engines.spec.ts", "**/no-session.spec.ts"],
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
  webServer: [
    {
      command: "pnpm gate-e:serve",
      url: "http://127.0.0.1:8791/__log",
      reuseExistingServer: !process.env.CI,
      timeout: 15_000,
    },
    // The SSR rows' production servers (gate-e/frameworks/serve.mjs), reached through the mock
    // server (`/en`, `/de`, `/_next` and `/nuxt`): the pages keep the one origin the Gate E
    // build permits.
    {
      command: "node gate-e/frameworks/serve.mjs next",
      url: "http://127.0.0.1:8792/en",
      reuseExistingServer: !process.env.CI,
      timeout: 30_000,
    },
    {
      command: "node gate-e/frameworks/serve.mjs nuxt",
      url: "http://127.0.0.1:8793/nuxt/",
      reuseExistingServer: !process.env.CI,
      timeout: 30_000,
    },
  ],
});
