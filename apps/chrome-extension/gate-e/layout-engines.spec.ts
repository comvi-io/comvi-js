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
 * supported there. WebKit ON macOS is a KNOWN DEFECT (owner decision 2026-11-19): during an
 * editing session a frame changes the shaping of the neighbouring glyph and breaks Arabic
 * joining. WebKit is outside the editor's supported way of working; the defect is to be
 * returned to before the editor is supported there. `test.fail` keeps that reproduction on
 * macOS: it reports when WebKit stops failing, and its values are never asserted as intended.
 * Linux WebKit (the CI runner) did not reproduce it: there the comparison is measured and
 * reported, neither asserted as a defect nor counted as WebKit being neutral.
 *
 * Every run also records whether the engine SHAPED Arabic at all (the joined word narrower
 * than its letters set apart): without a shaping Arabic font the Arabic rows on that
 * platform are not evidence either way, and the test says so.
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
  const shaping = await arabicShaping(page);
  await record(`marker-layout-${engine}-${process.platform}.json`, { after, pixels, shaping });
  if (!shaping.shaped) {
    test.info().annotations.push({
      type: "not evidence",
      description: `${engine} on ${process.platform} did not shape Arabic (joined ${shaping.joined} px, letters apart ${shaping.apart} px): the Arabic rows prove nothing here`,
    });
  }
  return { after, pixels, shaping };
}

/**
 * Whether the engine joins Arabic here: the word كتب is narrower joined than its three
 * letters each in a box of its own (isolated forms). Equal widths mean no shaping font.
 */
async function arabicShaping(page: Page) {
  return page.evaluate(() => {
    const span = (text: string) => {
      const s = document.createElement("span");
      s.lang = "ar";
      s.dir = "rtl";
      s.style.font = "16px sans-serif";
      s.textContent = text;
      document.body.append(s);
      const width = s.getBoundingClientRect().width;
      s.remove();
      return width;
    };
    const joined = span("كتب");
    const apart = [..."كتب"].reduce((sum, letter) => sum + span(letter), 0);
    return { joined, apart, shaped: Math.abs(apart - joined) > 0.5 };
  });
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
  const webkit = info.project.name === "webkit";
  // Only the known defect is expected to fail here, and only where it was measured: the
  // prerequisites are the test above.
  test.fail(
    webkit && process.platform === "darwin",
    "known defect, owner decision 2026-11-19: in WebKit on macOS a frame changes the neighbouring glyph's shaping and breaks Arabic joining",
  );
  const { after, pixels } = await measured(page, info.project.name);
  if (webkit && process.platform !== "darwin") {
    // Not reproduced in Linux WebKit: reported, neither a defect nor a neutrality claim.
    const differs = Object.entries(after)
      .filter(([key, { plain, marked }]) => !pixels[key] || plain.width !== marked.width)
      .map(([key]) => key);
    test.info().annotations.push({
      type: "reported, not a support claim",
      description: `WebKit on ${process.platform}: cases whose width or pixels differ: ${differs.join(", ") || "none"}`,
    });
    return;
  }
  // Before marking both boxes of a case are the same unmarked render, so the plain box after
  // is the baseline: unchanged means marked equals plain.
  const baseline = Object.fromEntries(
    Object.entries(after).map(([key, { plain }]) => [key, { plain, marked: { ...plain } }]),
  ) as Measures;
  expectUnchanged(baseline, after);
  expect(pixels).toEqual(Object.fromEntries(Object.keys(after).map((key) => [key, true])));
});
