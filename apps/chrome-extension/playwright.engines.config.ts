import { defineConfig, devices } from "@playwright/test";

/**
 * Plain pages in three engines, no extension: the marker layout check
 * (gate-e/layout-engines.spec.ts) and "no frame without an editor session"
 * (gate-e/no-session.spec.ts). The extension is Chromium-only and is not loaded here.
 * Chromium is the supported engine; Firefox checks the marker format as an extra, with no
 * promise that the extension is supported there. WebKit on macOS (Playwright): the cases of
 * the recorded known defect are `test.fail` (owner decision 2026-11-19), every other case is
 * required. WebKit on Linux (the CI runner) did not reproduce the defect: its width and pixel
 * comparison is reported as an annotation, neither asserted nor a neutrality claim.
 */
export default defineConfig({
  testDir: "./gate-e",
  testMatch: ["layout-engines.spec.ts", "no-session.spec.ts"],
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
