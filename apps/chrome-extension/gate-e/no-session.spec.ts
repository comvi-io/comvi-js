import { expect, test } from "@playwright/test";
import { tagCharactersInDocument } from "./rows";

/**
 * Owner decision 2026-11-19 (3a): a page that composes `devtools()` and has no editor session
 * renders no frame and no tag character anywhere — the app's own text, every attribute, the
 * title. An ordinary app in a browser the editor does not support (WebKit) must not depend on
 * the editor's limits there. Plain pages, no extension: run by `playwright.engines.config.ts`
 * in Chromium, Firefox and WebKit.
 */
const PAGES = ["/app", "/fw/react", "/fw/vue", "/fw/solid", "/fw/svelte"];

for (const path of PAGES) {
  test(`${path}: devtools() without an editor session renders no frame or tag character`, async ({
    page,
  }) => {
    await page.goto(`http://127.0.0.1:8791${path}`);
    await expect(page.locator("body")).toHaveAttribute("data-booted", "true");
    // The instance is published for the extension: the check is not vacuous.
    expect(await page.evaluate(() => (globalThis as any).__COMVI__?.length)).toBeGreaterThan(0);
    await expect(page.locator("#A-title")).toHaveText("Welcome home");
    expect(await tagCharactersInDocument(page)).toEqual([]);
    // Output rendered later is unmarked too.
    if (path !== "/app") {
      await page.locator("#more").click();
      await expect(page.locator("#A-late")).toHaveText("About us");
    } else {
      await page.evaluate(() => (globalThis as any).gateE.render());
    }
    expect(await tagCharactersInDocument(page)).toEqual([]);
  });
}
