/**
 * Helpers for the Comvi 0.8 site pages (fixtures/*.js, served by mock-api-server.mjs): launch,
 * open a page, enable the editor from the real popup, drive the editor's real UI, read the
 * mock platform's request log, and decode the self-contained translation markers on the page.
 */
import { expect, test, type Browser, type Locator, type Page } from "@playwright/test";
import { decodeFrames, stripFrames } from "./frames";
import {
  activateEditor,
  activeTabId,
  expectPopupView,
  launchGateE,
  openPopup,
  storedSession,
  waitForDetection,
  type CdnMode,
} from "./helpers";

export const ORIGIN = "http://127.0.0.1:8791";
export const POLL = { timeout: 10_000 };

export type Launched = Awaited<ReturnType<typeof launchGateE>>;

export interface ApiRequest {
  method: string;
  path: string;
  auth: string | null;
  body: string | null;
}

/** Every request that reached the mock API since the last reset. */
export async function apiLog(): Promise<ApiRequest[]> {
  const response = await fetch(`${ORIGIN}/__log`);
  return ((await response.json()) as { requests: ApiRequest[] }).requests;
}

/** The mock platform's keys: namespace → key → locale → value. */
export async function platformStore(): Promise<
  Record<string, Record<string, Record<string, string>>>
> {
  return (await fetch(`${ORIGIN}/__store`)).json();
}

export async function configureMock(settings: Record<string, string | number>): Promise<void> {
  const query = new URLSearchParams(
    Object.entries(settings).map(([key, value]) => [key, String(value)]),
  );
  await fetch(`${ORIGIN}/__config?${query}`);
}

/** Launch, reset the mock platform, run, close: every test gets a clean browser and store. */
export async function withGateE(
  options: { cdn?: CdnMode; backForwardCache?: boolean },
  run: (launched: Launched, popups: Browser[]) => Promise<void>,
): Promise<void> {
  await fetch(`${ORIGIN}/__reset`);
  const launched = await launchGateE(options);
  try {
    await run(launched, []);
  } finally {
    await launched.context.close();
  }
}

/** Open a site page in a new tab, wait for its app to boot and, by default, for detection. */
export async function openSite(launched: Launched, path: string, detected = true) {
  const page = await launched.context.newPage();
  await page.goto(`${ORIGIN}${path}`);
  await expect(page.locator("body")).toHaveAttribute("data-booted", "true", POLL);
  await page.bringToFront();
  const tabId = await activeTabId(launched.worker);
  if (detected) await waitForDetection(launched.worker, tabId);
  return { page, tabId };
}

export const popupFor = (launched: Launched, popups: Browser[]) =>
  openPopup(launched.worker, launched.extensionId, launched.debuggingPort, popups);

/** Enable the editor from a fresh popup, close the popup, and bring the page back. */
export async function enable(
  launched: Launched,
  popups: Browser[],
  page: Page,
  tabId: number,
  apiKey?: string,
): Promise<void> {
  const popup = await popupFor(launched, popups);
  await activateEditor(popup, page, launched.worker, tabId, apiKey);
  await popup.close();
  await page.bringToFront();
}

/** Disable the editor from a fresh popup. */
export async function disable(
  launched: Launched,
  popups: Browser[],
  page: Page,
  tabId: number,
): Promise<void> {
  const popup = await popupFor(launched, popups);
  await expectPopupView(popup, launched.worker, page, "active", tabId);
  await popup.locator("#disable-btn").click();
  await expectPopupView(popup, launched.worker, page, "idle", tabId);
  await expect.poll(() => storedSession(launched.worker, tabId), POLL).toBeUndefined();
  await popup.close();
  await page.bringToFront();
}

/** Click Enable and return the popup's error line; the session must not survive. */
export async function enableExpectingFailure(
  launched: Launched,
  popups: Browser[],
  page: Page,
  tabId: number,
): Promise<string> {
  const popup = await popupFor(launched, popups);
  await expectPopupView(popup, launched.worker, page, "idle", tabId);
  await popup.locator("#api-key").fill("gate-e-key");
  await popup.locator("#enable-btn").click();
  // The detector's load limit is 12 s, inside the popup's 15 s budget.
  await expect(popup.locator("#error-msg")).toBeVisible({ timeout: 16_000 });
  await expect.poll(() => storedSession(launched.worker, tabId), POLL).toBeUndefined();
  const text = (await popup.locator("#error-msg").textContent()) ?? "";
  await popup.close();
  await page.bringToFront();
  return text;
}

/** The frames in an element's text, decoded: what the editor will resolve a click to. */
export async function framesIn(page: Page, selector: string) {
  const text = await page.locator(selector).evaluate((el) => el.textContent ?? "");
  return decodeFrames(text).map(({ inst, ns, key, close }) => ({ inst, ns, key, close }));
}

/** An element's text with every recognised frame removed: what a reader sees. */
export async function visibleText(page: Page, selector: string): Promise<string> {
  return stripFrames(await page.locator(selector).evaluate((el) => el.textContent ?? ""));
}

/** Every frame anywhere in the page's text. */
export async function allFrames(page: Page) {
  return decodeFrames(await page.evaluate(() => document.body.textContent ?? ""));
}

/** The editor's edit dialog (in its open shadow root; Playwright locators pierce it). */
export const dialog = (page: Page): Locator => page.getByRole("dialog").first();

/** The translation field of one language in the open dialog. */
export const field = (page: Page, language: string): Locator =>
  dialog(page).getByPlaceholder(`Enter ${language} translation...`);

/**
 * Alt-click `selector` until the editor's dialog opens. The editor marks output rendered
 * after it became active and learns of it through a MutationObserver, so the first clicks may
 * land before the element is registered; the dialog is the observable result.
 */
export async function openEditor(page: Page, selector: string): Promise<void> {
  await expect
    .poll(async () => {
      if (await dialog(page).isVisible()) return true;
      await page.locator(selector).click({ modifiers: ["Alt"] });
      return dialog(page).isVisible();
    }, POLL)
    .toBe(true);
}

/** Type `text` into a language's field of the open dialog, replacing what it holds. */
export async function typeInto(page: Page, language: string, text: string): Promise<void> {
  const input = field(page, language);
  await expect(input).toBeVisible(POLL);
  await input.fill(text);
}

/** Press the dialog's Save, and wait for the toast that says how it went. */
export async function save(page: Page): Promise<string> {
  await dialog(page).getByRole("button", { name: "Save", exact: true }).click();
  // The editor's toast (ToastContainer.vue): no ARIA role, a fixed corner stack.
  const toast = page.locator(".fixed.bottom-4.right-4 > div").last();
  await expect(toast).toBeVisible(POLL);
  return (await toast.textContent()) ?? "";
}

/** Close the dialog without saving (a clean form closes at once). */
export async function closeDialog(page: Page): Promise<void> {
  await dialog(page).getByRole("button", { name: "Cancel" }).click();
  const discard = page.getByRole("button", { name: "Discard" });
  if (await discard.isVisible()) await discard.click();
  await expect(dialog(page)).toBeHidden(POLL);
}

/** The requests to the context routes: owner decision D4 says there are none. */
export const contextRequests = (log: ApiRequest[]) =>
  log.filter((entry) => entry.path.startsWith("/v1/context/"));

export { test, expect };
