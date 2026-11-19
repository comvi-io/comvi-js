import { expect, test, type Page } from "@playwright/test";
import {
  expectMarkedAgainstControl,
  expectUnchanged,
  identicalPixels,
  measureAll,
  record,
  type Measures,
} from "./layout-measure";

/**
 * The marker layout in the three engines. The layout cases of `fixtures/layout.js` (a Latin sentence in a narrow box,
 * Thai ending in ZWSP, Persian ending in ZWNJ, Arabic and two messages joined inside one
 * Arabic word, a nowrap/ellipsis box, rich output with paired frames) are marked by the
 * editor's own standalone build, activated on the page directly; the extension is not run
 * here. Run by `playwright.engines.config.ts` in Chromium, Firefox and WebKit.
 *
 * Chromium, the engine the extension runs in, must measure marked output identical to
 * unmarked. Firefox is an extra check of the format, with no promise that the extension is
 * supported there. WebKit is a KNOWN DEFECT (owner decision 2026-11-19): during an editing
 * session a frame changes the shaping of the neighbouring glyph and breaks Arabic joining.
 * WebKit is outside the editor's supported way of working; the defect is to be returned to
 * before the editor is supported there. `test.fail` keeps the reproduction: it reports when
 * WebKit stops failing, and the measured values are never asserted as intended behaviour.
 */
/** Loads the page, waits for the editor's marking, measures and records every case. */
async function measured(page: Page, engine: string) {
  await page.goto("http://127.0.0.1:8791/layout-standalone");
  await expect(page.locator("body")).toHaveAttribute("data-booted", "true");
  await expect(page.locator("body")).toHaveAttribute("data-marking", "true");
  await expect
    .poll(async () => Object.values(await measureAll(page)).every((c) => c.marked.frames > 0))
    .toBe(true);
  const after = await measureAll(page);
  const pixels = await identicalPixels(page, Object.keys(after));
  await record(`marker-layout-${engine}.json`, { after, pixels });
  return { after, pixels };
}

// Required in every engine, WebKit included: the page loads, the editor marks, the control
// box is unmarked and the marked box carries its frames, and marking keeps the line count
// and the height.
test("the editor marks every case, the control stays unmarked, and lines and height are kept", async ({
  page,
}, info) => {
  const { after } = await measured(page, info.project.name);
  expectMarkedAgainstControl(after);
});

test("marked output keeps the width and the pixels of unmarked output", async ({ page }, info) => {
  // Only the known defect is expected to fail here: the prerequisites are the test above.
  test.fail(
    info.project.name === "webkit",
    "known defect, owner decision 2026-11-19: in WebKit a frame changes the neighbouring glyph's shaping and breaks Arabic joining",
  );
  const { after, pixels } = await measured(page, info.project.name);
  // Before marking both boxes of a case are the same unmarked render, so the plain box after
  // is the baseline: unchanged means marked equals plain.
  const baseline = Object.fromEntries(
    Object.entries(after).map(([key, { plain }]) => [key, { plain, marked: { ...plain } }]),
  ) as Measures;
  expectUnchanged(baseline, after);
  expect(pixels).toEqual(Object.fromEntries(Object.keys(after).map((key) => [key, true])));
});
