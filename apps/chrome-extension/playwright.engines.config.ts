import { defineConfig, devices } from "@playwright/test";

/**
 * The marker layout check in three engines (gate-e/layout-engines.spec.ts). Only this page
 * runs in Firefox and WebKit: the extension is Chromium-only and is not loaded here.
 */
export default defineConfig({
  testDir: "./gate-e",
  testMatch: "layout-engines.spec.ts",
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  workers: 1,
  reporter: "line",
  timeout: 30_000,
  use: { viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 720 } },
    },
    {
      name: "firefox",
      use: { ...devices["Desktop Firefox"], viewport: { width: 1280, height: 720 } },
    },
    {
      name: "webkit",
      use: { ...devices["Desktop Safari"], viewport: { width: 1280, height: 720 } },
    },
  ],
  webServer: {
    command: "pnpm gate-e:serve",
    url: "http://127.0.0.1:8791/__log",
    reuseExistingServer: !process.env.CI,
    timeout: 15_000,
  },
});
