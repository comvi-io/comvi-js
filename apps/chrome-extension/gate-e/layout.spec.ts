import { expectUnchanged, identicalPixels, measureAll, record } from "./layout-measure";
import { enable, expect, openSite, POLL, test, withGateE } from "./site";

/**
 * Map D5 owes this measurement of width and wrapping in a browser, here Chromium, the engine
 * the extension runs in. Each case renders one message twice in identically styled
 * shrink-to-fit boxes, `markers: false` and marked, and real Chromium measures both. Width,
 * height, line count and (for the ellipsis box) the overflowing width must be IDENTICAL; the
 * numbers are written to test-results/marker-layout.json either way.
 */

test("marked output keeps the width, height and line breaks of unmarked output", async () => {
  test.setTimeout(90_000);
  await withGateE({}, async (launched, popups) => {
    const { page, tabId } = await openSite(launched, "/layout");
    const before = await measureAll(page);
    for (const [key, { plain, marked }] of Object.entries(before)) {
      // Sanity: before Enable both boxes are unmarked and identical.
      expect({ key, ...marked, frames: 0 }).toEqual({ key, ...plain, frames: 0 });
    }

    await enable(launched, popups, page, tabId);
    await expect
      .poll(
        async () => Object.values(await measureAll(page)).every((c) => c.marked.frames > 0),
        POLL,
      )
      .toBe(true);
    const after = await measureAll(page);
    await record("marker-layout.json", { before, after });
    const pixels = await identicalPixels(page, Object.keys(after));
    await record("marker-layout-pixels.json", pixels);
    expect(pixels).toEqual(Object.fromEntries(Object.keys(after).map((key) => [key, true])));
    expectUnchanged(before, after);
  });
});
