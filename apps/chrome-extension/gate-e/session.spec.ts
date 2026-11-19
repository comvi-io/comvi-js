import { randomUUID } from "node:crypto";
import type { Page } from "@playwright/test";
import { decodeFrames } from "./frames";
import { activeTabId, storedSession, waitForDetection } from "./helpers";
import {
  allFrames,
  apiLog,
  closeDialog,
  contextRequests,
  enable,
  expect,
  openEditor,
  ORIGIN,
  POLL,
  save,
  test,
  typeInto,
  visibleText,
  withGateE,
} from "./site";

test.describe.configure({ timeout: 120_000 });

/**
 * Records, in the page's MAIN world and before any script runs, everything a page script
 * could see of the extension: every event dispatched on `window` (those the MAIN world sends,
 * through dispatchEvent, and those the ISOLATED-world bridge sends, through listeners on every
 * type the channel uses) and every console line.
 */
async function recordPageVisible(page: Page) {
  const console: string[] = [];
  page.on("console", (message) => console.push(message.text()));
  await page.addInitScript(() => {
    const seen: string[] = [];
    (globalThis as any).__SEEN__ = seen;
    const record = (event: Event) => {
      let detail: string;
      try {
        detail = JSON.stringify((event as CustomEvent).detail ?? null);
      } catch {
        detail = String((event as CustomEvent).detail);
      }
      seen.push(`${event.type} ${detail}`);
    };
    const dispatch = EventTarget.prototype.dispatchEvent;
    EventTarget.prototype.dispatchEvent = function (event) {
      record(event);
      return dispatch.call(this, event);
    };
    for (const type of [
      "comvi-extension:status",
      "comvi-extension:detected",
      "comvi-extension:not-found",
      "comvi-extension:activate",
      "comvi-extension:deactivate",
      "comvi-extension:api-response",
      "comvi-extension:get-status",
      "comvi-in-context-editor:lifecycle",
    ]) {
      addEventListener(type, record, true);
    }
  });
  return {
    console,
    events: () => page.evaluate(() => (globalThis as any).__SEEN__ as string[]),
  };
}

/** The page's whole DOM as text, every open shadow root included. */
const wholeDom = (page: Page) =>
  page.evaluate(() => {
    const parts = [document.documentElement.outerHTML];
    for (const element of document.querySelectorAll("*")) {
      if (element.shadowRoot) parts.push(element.shadowRoot.innerHTML);
    }
    return parts.join("\n");
  });

test("a whole session, a navigation and a reload included: no context request, and the key reaches no page surface", async () => {
  // A key nobody could guess: if any byte of it reaches the page, the checks below find it.
  const apiKey = `gate-e-secret-${randomUUID()}`;
  await withGateE({}, async (launched, popups) => {
    const page = await launched.context.newPage();
    const visible = await recordPageVisible(page);
    await page.goto(`${ORIGIN}/app`);
    await expect(page.locator("body")).toHaveAttribute("data-booted", "true", POLL);
    await page.bringToFront();
    const tabId = await activeTabId(launched.worker);
    await waitForDetection(launched.worker, tabId);

    await test.step("enable, edit and save", async () => {
      await enable(launched, popups, page, tabId, apiKey);
      await openEditor(page, "#A-title");
      await typeInto(page, "English", "First save");
      await save(page);
      await expect.poll(() => visibleText(page, "#A-title"), POLL).toBe("First save");
      await closeDialog(page);
    });

    await test.step("a client navigation, another edit", async () => {
      await page.evaluate(() => (globalThis as any).gateE.navigate("about"));
      await openEditor(page, "#route-about-title");
      await typeInto(page, "English", "Second save");
      await save(page);
      await closeDialog(page);
    });

    await test.step("the markers name an instance, a namespace and a key, nothing else", async () => {
      const frames = await allFrames(page);
      expect(frames.length).toBeGreaterThan(0);
      for (const frame of frames) {
        expect(frame.inst).toBe("");
        expect(["default", "common", "about"]).toContain(frame.ns);
        expect(frame.key).toMatch(/^[\w.]+$/);
      }
      expect(JSON.stringify(frames)).not.toContain(apiKey);
    });

    const surfaces = async () => ({
      dom: await wholeDom(page),
      events: (await visible.events()).join("\n"),
      console: visible.console.join("\n"),
      frames: JSON.stringify(
        decodeFrames(await page.evaluate(() => document.body.textContent ?? "")),
      ),
      storage: await page.evaluate(() => JSON.stringify({ ...localStorage, ...sessionStorage })),
      url: page.url(),
    });

    await test.step("the key is on no page surface: DOM, markers, console, events, storage", async () => {
      const seen = await surfaces();
      for (const [surface, text] of Object.entries(seen)) {
        expect({ surface, leaked: text.includes(apiKey) }).toEqual({ surface, leaked: false });
      }
      // The recorder works: it saw the channel's own events.
      expect(seen.events).toContain("comvi-extension:activate");
      expect(seen.events).toContain("comvi-extension:api-response");
    });

    await test.step("a reload ends the session; a new Enable starts one again", async () => {
      await page.reload();
      await expect(page.locator("body")).toHaveAttribute("data-booted", "true", POLL);
      await expect.poll(() => storedSession(launched.worker, tabId), POLL).toBeUndefined();
      await waitForDetection(launched.worker, tabId);
      await enable(launched, popups, page, tabId, apiKey);
      await openEditor(page, "#A-common");
      await typeInto(page, "English", "Third save");
      await save(page);
      await closeDialog(page);
      const seen = await surfaces();
      for (const [surface, text] of Object.entries(seen)) {
        expect({ surface, leaked: text.includes(apiKey) }).toEqual({ surface, leaked: false });
      }
    });

    await test.step("owner decision D4: not one request to the context routes", async () => {
      const log = await apiLog();
      expect(log.filter((entry) => entry.method === "PUT")).toHaveLength(3);
      expect(contextRequests(log)).toEqual([]);
      // Nor did the editor ask for one: the worker would refuse it, so look at the page side.
      const asked = (await visible.events()).filter(
        (line) => line.startsWith("comvi-extension:api-request") && line.includes("/v1/context/"),
      );
      expect(asked).toEqual([]);
      expect(
        (await visible.events()).some((line) => line.startsWith("comvi-extension:api-request")),
      ).toBe(true);
      // Every API request carried the key, and only the service worker sent it.
      expect(log.every((entry) => entry.auth === `Bearer ${apiKey}`)).toBe(true);
    });
  });
});
