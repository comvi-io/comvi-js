/**
 * The marker layout measurement shared by Gate E (`layout.spec.ts`, Chromium with the real
 * extension) and the plain-page check (`layout-engines.spec.ts`, the editor's standalone
 * build in Chromium, Firefox and WebKit): every case of `fixtures/layout.js`, its unmarked and its marked box.
 */
import { writeFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { decodeFrames } from "./frames";

export interface Measure {
  width: number;
  height: number;
  lines: number;
  scrollWidth: number;
  frames: number;
}

/** Each case's plain and marked box, measured with getBoundingClientRect and line boxes. */
export function measureAll(
  page: Page,
): Promise<Record<string, { plain: Measure; marked: Measure }>> {
  return page
    .evaluate(() => {
      const measure = (box: HTMLElement) => {
        const rect = box.getBoundingClientRect();
        const range = document.createRange();
        range.selectNodeContents(box);
        // Line boxes: the tops of the text's rects, grouped by half the 20 px line height (an
        // engine may put two rects of one line a pixel apart).
        const tops = [...range.getClientRects()]
          .filter((r) => r.width > 0)
          .map((r) => r.top)
          .sort((a, b) => a - b);
        const lines = tops.filter((top, k) => k === 0 || top - tops[k - 1]! > 10);
        return {
          width: rect.width,
          height: rect.height,
          lines: lines.length,
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

export type Measures = Awaited<ReturnType<typeof measureAll>>;

/** The frames each case carries once marked: a pair for rich output and the joined pair. */
export const FRAMES: Record<string, number> = { rich: 2, arabicJoin: 2 };

/**
 * Same text, same box, same x: identical pixels mean identical shaping (Arabic joining
 * included), not only identical advance widths.
 */
export async function identicalPixels(
  page: Page,
  keys: string[],
): Promise<Record<string, boolean>> {
  const pixels: Record<string, boolean> = {};
  for (const key of keys) {
    const row = page.locator(`[data-case="${key}"]`);
    const [plainShot, markedShot] = await Promise.all([
      row.locator('[data-variant="plain"]').screenshot(),
      row.locator('[data-variant="marked"]').screenshot(),
    ]);
    pixels[key] = plainShot.equals(markedShot);
  }
  return pixels;
}

/** Writes the numbers to the test's output and its report, whatever the verdict. */
export async function record(name: string, value: unknown): Promise<void> {
  writeFileSync(test.info().outputPath(name), JSON.stringify(value, null, 2));
  await test
    .info()
    .attach(name, { body: JSON.stringify(value, null, 2), contentType: "application/json" });
  console.log(`[${name}] ${JSON.stringify(value)}`);
}

/**
 * What any engine must show before the layout is compared: the control box is unmarked
 * (`{ markers: false }` works), the marked box carries its frames, and marking changes
 * neither the line count nor the height.
 */
export function expectMarkedAgainstControl(after: Measures): void {
  for (const [key, { plain, marked }] of Object.entries(after)) {
    expect({ key, plain: plain.frames, marked: marked.frames }).toEqual({
      key,
      plain: 0,
      marked: FRAMES[key] ?? 1,
    });
    expect({ key, lines: marked.lines, height: marked.height }).toEqual({
      key,
      lines: plain.lines,
      height: plain.height,
    });
  }
}

/** Marked equals unmarked, box by box; the unmarked box did not move. */
export function expectUnchanged(before: Measures, after: Measures): void {
  expectMarkedAgainstControl(after);
  for (const [key, { plain, marked }] of Object.entries(after)) {
    expect({ key, ...plain }).toEqual({ key, ...before[key]!.plain });
    const { frames: _p, ...plainBox } = plain;
    const { frames: _m, ...markedBox } = marked;
    expect({ key, ...markedBox }).toEqual({ key, ...plainBox });
  }
}
