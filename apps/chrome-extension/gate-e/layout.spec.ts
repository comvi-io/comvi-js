import { writeFileSync } from "node:fs";
import type { Page } from "@playwright/test";
import { decodeFrames } from "./frames";
import { enable, expect, openSite, POLL, test, withGateE } from "./site";

/**
 * Map D5 owes this measurement: "no change of width or wrapping" is the plan's claim until it
 * is measured in a browser. Each case renders one message twice in identically styled
 * shrink-to-fit boxes, `markers: false` and marked, and real Chromium measures both. Width,
 * height, line count and (for the ellipsis box) the overflowing width must be IDENTICAL; the
 * numbers are written to test-results/marker-layout.json either way.
 */

interface Measure {
  width: number;
  height: number;
  lines: number;
  scrollWidth: number;
  frames: number;
}

/** Each case's plain and marked box, measured with getBoundingClientRect and line boxes. */
function measureAll(page: Page): Promise<Record<string, { plain: Measure; marked: Measure }>> {
  return page
    .evaluate(() => {
      const measure = (box: HTMLElement) => {
        const rect = box.getBoundingClientRect();
        const range = document.createRange();
        range.selectNodeContents(box);
        const tops = new Set(
          [...range.getClientRects()].filter((r) => r.width > 0).map((r) => Math.round(r.top)),
        );
        return {
          width: rect.width,
          height: rect.height,
          lines: tops.size,
          scrollWidth: box.scrollWidth,
          text: box.textContent ?? "",
        };
      };
      const out: Record<string, Record<string, unknown>> = {};
      for (const row of document.querySelectorAll<HTMLElement>("[data-case]")) {
        const [plain, marked] = [...row.querySelectorAll<HTMLElement>("[data-variant]")];
        out[row.dataset.case!] = { plain: measure(plain!), marked: measure(marked!) };
      }
      return out;
    })
    .then((raw) =>
      Object.fromEntries(
        Object.entries(raw).map(([key, value]) => {
          const strip = (m: Record<string, unknown>): Measure => ({
            width: m.width as number,
            height: m.height as number,
            lines: m.lines as number,
            scrollWidth: m.scrollWidth as number,
            frames: decodeFrames(m.text as string).length,
          });
          const v = value as { plain: Record<string, unknown>; marked: Record<string, unknown> };
          return [key, { plain: strip(v.plain), marked: strip(v.marked) }];
        }),
      ),
    );
}

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
    writeFileSync(
      test.info().outputPath("marker-layout.json"),
      JSON.stringify({ before, after }, null, 2),
    );
    await test.info().attach("marker-layout.json", {
      body: JSON.stringify(after, null, 2),
      contentType: "application/json",
    });
    console.log(`[marker-layout] ${JSON.stringify(after)}`);

    // Same text, same box, same x: identical pixels mean identical shaping (Arabic joining
    // included), not only identical advance widths.
    const pixels: Record<string, boolean> = {};
    for (const key of Object.keys(after)) {
      const row = page.locator(`[data-case="${key}"]`);
      const [plainShot, markedShot] = await Promise.all([
        row.locator('[data-variant="plain"]').screenshot(),
        row.locator('[data-variant="marked"]').screenshot(),
      ]);
      pixels[key] = plainShot.equals(markedShot);
    }
    console.log(`[marker-layout] identical pixels: ${JSON.stringify(pixels)}`);
    writeFileSync(
      test.info().outputPath("marker-layout-pixels.json"),
      JSON.stringify(pixels, null, 2),
    );
    expect(pixels).toEqual(Object.fromEntries(Object.keys(after).map((key) => [key, true])));

    for (const [key, { plain, marked }] of Object.entries(after)) {
      // The plain box did not move, and is still unmarked.
      expect({ key, ...plain }).toEqual({ key, ...before[key]!.plain });
      expect({ key, frames: marked.frames }).toEqual({
        key,
        frames: key === "rich" ? 2 : key === "arabicJoin" ? 2 : 1,
      });
      const { frames: _p, ...plainBox } = plain;
      const { frames: _m, ...markedBox } = marked;
      expect({ key, ...markedBox }).toEqual({ key, ...plainBox });
    }
  });
});
