/**
 * tearing.spec.ts — Playwright E2E for Repro 1 (startTransition + locale flip)
 *
 * Why this exists:
 *   happy-dom commits trees atomically into the DOM. `getByTestId` only ever
 *   reads a committed snapshot, so mid-transition DOM state where one sibling
 *   has been processed and the other has not is invisible to the Vitest
 *   harness.
 *
 *   This spec runs in a real Chromium browser where React's concurrent
 *   renderer can interleave work across frames. We poll the live DOM at 16 ms
 *   intervals and assert pair-consistency at every observable snapshot:
 *
 *     consumer-a === consumer-b at all times
 *     (both "Comvi i18n Example" [EN] or both "Exemple Comvi i18n" [FR])
 *
 * If tearing is present, the poller will catch a snapshot where one consumer
 * already shows FR while the other still shows EN, and the test fails.
 *
 * Translation values:
 *   EN: home.title → "Comvi i18n Example"
 *   FR: home.title → "Exemple Comvi i18n"
 */

import { test, expect, Page } from "@playwright/test";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const EN_VALUE = "Comvi i18n Example";
const FR_VALUE = "Exemple Comvi i18n";

const POLL_INTERVAL_MS = 16; // ~1 frame
const SETTLE_TIMEOUT_MS = 8_000; // max wait for FR to appear

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Read the text content of consumer-a and consumer-b from the live DOM.
 * Uses `data-testid` attributes set by the tearing page component.
 */
async function readPair(page: Page): Promise<{ a: string; b: string }> {
  return page.evaluate(() => {
    const a = document.querySelector("[data-testid='consumer-a']");
    const b = document.querySelector("[data-testid='consumer-b']");
    return {
      a: a?.textContent?.trim() ?? "",
      b: b?.textContent?.trim() ?? "",
    };
  });
}

/**
 * Poll the DOM at POLL_INTERVAL_MS until `predicate` returns true or
 * `timeoutMs` is exceeded. Asserts pair-consistency on every sample.
 * Returns the last observed pair.
 */
async function pollUntil(
  page: Page,
  predicate: (pair: { a: string; b: string }) => boolean,
  timeoutMs = SETTLE_TIMEOUT_MS,
): Promise<{ a: string; b: string }> {
  const deadline = Date.now() + timeoutMs;
  let last = { a: "", b: "" };

  while (Date.now() < deadline) {
    last = await readPair(page);

    // Pair-consistency invariant: consumers must always show the same value.
    // Allowed states: both EN, both FR, or both empty (loading / not yet mounted).
    const consistent =
      last.a === last.b ||
      (last.a === "" && last.b === "") ||
      (last.a === EN_VALUE && last.b === EN_VALUE) ||
      (last.a === FR_VALUE && last.b === FR_VALUE);

    expect(
      consistent,
      `Tearing detected at poll sample — consumer-a="${last.a}" consumer-b="${last.b}"`,
    ).toBe(true);

    if (predicate(last)) return last;

    // Wait one polling interval before the next sample.
    await page.waitForTimeout(POLL_INTERVAL_MS);
  }

  throw new Error(
    `pollUntil timed out after ${timeoutMs}ms. Last pair: a="${last.a}" b="${last.b}"`,
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe("Tearing — startTransition locale flip (Repro 1)", () => {
  test.beforeEach(async ({ page }) => {
    // The middleware uses localePrefix: "as-needed", so the default locale (en)
    // is stripped from the URL. /en/tearing → 307 → /tearing.
    // Navigate directly to the canonical path to avoid redirect overhead.
    await page.goto("/tearing");
    await page.waitForSelector("[data-testid='consumer-a']", { state: "visible" });
    await page.waitForSelector("[data-testid='consumer-b']", { state: "visible" });
  });

  test("TC1: initial state — both consumers show EN value", async ({ page }) => {
    const pair = await readPair(page);
    expect(pair.a).toBe(EN_VALUE);
    expect(pair.b).toBe(EN_VALUE);
  });

  test("TC2: after startTransition locale flip — pair-consistent throughout, settles to FR", async ({
    page,
  }) => {
    // Verify initial EN state.
    const initial = await readPair(page);
    expect(initial.a).toBe(EN_VALUE);
    expect(initial.b).toBe(EN_VALUE);

    // Trigger the locale flip via startTransition (defined in the page component).
    await page.click("[data-testid='switch-to-fr']");

    // Poll until both consumers show FR, asserting pair-consistency on every sample.
    const settled = await pollUntil(page, ({ a, b }) => a === FR_VALUE && b === FR_VALUE);

    expect(settled.a).toBe(FR_VALUE);
    expect(settled.b).toBe(FR_VALUE);
  });

  test("TC3: reset back to EN — pair-consistent throughout, settles to EN", async ({ page }) => {
    // First flip to FR and let it settle.
    await page.click("[data-testid='switch-to-fr']");
    await pollUntil(page, ({ a, b }) => a === FR_VALUE && b === FR_VALUE);

    // Now reset to EN.
    await page.click("[data-testid='reset-to-en']");
    const settled = await pollUntil(page, ({ a, b }) => a === EN_VALUE && b === EN_VALUE);

    expect(settled.a).toBe(EN_VALUE);
    expect(settled.b).toBe(EN_VALUE);
  });

  test("TC4: rapid double flip (EN→FR→EN) — always pair-consistent, settles to EN", async ({
    page,
  }) => {
    // Click FR, immediately click EN without waiting — tests interleaved transitions.
    await page.click("[data-testid='switch-to-fr']");
    // Small pause to allow first transition to start but not finish.
    await page.waitForTimeout(30);
    await page.click("[data-testid='reset-to-en']");

    // Poll until settled at EN. Pair-consistency asserted throughout.
    const settled = await pollUntil(page, ({ a, b }) => a === EN_VALUE && b === EN_VALUE);

    expect(settled.a).toBe(EN_VALUE);
    expect(settled.b).toBe(EN_VALUE);
  });
});
