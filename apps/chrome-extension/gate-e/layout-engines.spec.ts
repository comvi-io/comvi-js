import { expect, test } from "@playwright/test";
import {
  expectUnchanged,
  identicalPixels,
  measureAll,
  record,
  type Measures,
} from "./layout-measure";

/**
 * Owner update 2026-11-19, item 4: "width and wrapping unchanged" needs three engines, not
 * Chromium alone. The layout cases of `fixtures/layout.js` (a Latin sentence in a narrow box,
 * Thai ending in ZWSP, Persian ending in ZWNJ, Arabic and two messages joined inside one
 * Arabic word, a nowrap/ellipsis box, rich output with paired frames) are marked by the
 * editor's own standalone build, activated on the page directly; the extension is not run
 * here. Run by `playwright.engines.config.ts` in Chromium, Firefox and WebKit.
 */
test("marked output keeps the width, height and line breaks of unmarked output", async ({
  page,
}, info) => {
  await page.goto("http://127.0.0.1:8791/layout-standalone");
  await expect(page.locator("body")).toHaveAttribute("data-booted", "true");
  await expect(page.locator("body")).toHaveAttribute("data-marking", "true");
  await expect
    .poll(async () => Object.values(await measureAll(page)).every((c) => c.marked.frames > 0))
    .toBe(true);
  const after = await measureAll(page);
  const pixels = await identicalPixels(page, Object.keys(after));
  await record(`marker-layout-${info.project.name}.json`, { after, pixels });
  // Before marking both boxes of a case are the same unmarked render, so the plain box after
  // is the baseline: unchanged means marked equals plain.
  const baseline = Object.fromEntries(
    Object.entries(after).map(([key, { plain }]) => [key, { plain, marked: { ...plain } }]),
  ) as Measures;
  expectUnchanged(baseline, after);
  expect(pixels).toEqual(Object.fromEntries(Object.keys(after).map((key) => [key, true])));
});
