import type { Page } from "@playwright/test";
import { expectPopupView } from "./helpers";
import {
  allFrames,
  apiLog,
  closeDialog,
  disable,
  enable,
  expect,
  field,
  framesIn,
  openEditor,
  openSite,
  POLL,
  popupFor,
  save,
  test,
  typeInto,
  visibleText,
  withGateE,
} from "./site";

test.describe.configure({ timeout: 90_000 });

/**
 * The event listeners on `document` and `window` that page, extension and editor scripts
 * registered, by type, read over CDP. Playwright's own injected scripts (no URL) register
 * listeners as it acts; they are not counted.
 */
async function pageListeners(page: Page): Promise<Record<string, number>> {
  const cdp = await page.context().newCDPSession(page);
  const urls = new Map<string, string>();
  cdp.on("Debugger.scriptParsed", (event) => urls.set(event.scriptId, event.url));
  await cdp.send("Debugger.enable");
  try {
    const counts: Record<string, number> = {};
    for (const expression of ["document", "window"]) {
      const { result } = await cdp.send("Runtime.evaluate", { expression });
      const { listeners } = await cdp.send("DOMDebugger.getEventListeners", {
        objectId: result.objectId!,
      });
      for (const { type, scriptId } of listeners) {
        if (!urls.get(scriptId)) continue;
        counts[`${expression}:${type}`] = (counts[`${expression}:${type}`] ?? 0) + 1;
      }
    }
    return counts;
  } finally {
    await cdp.detach();
  }
}

/** Every trace of the editor's UI in the page's DOM. */
const editorDom = (page: Page) =>
  page.evaluate(
    () =>
      document.querySelectorAll("[data-comvi-editor-ui], [data-comvi-editor-ui-shadow-host]")
        .length,
  );

test("an instance that appears after the popup opened, and one that joins an active session, are both editable", async () => {
  await withGateE({}, async (launched, popups) => {
    const { page, tabId } = await openSite(launched, "/app?late=1", false);

    await test.step("no instance yet: not detected; the instance appears; the open popup offers Enable", async () => {
      const popup = await popupFor(launched, popups);
      await expectPopupView(popup, launched.worker, page, "not-detected", tabId);
      await page.evaluate(() => (globalThis as any).gateE.create("A", "core1"));
      // The popup asks the page again every second while it says "not detected".
      await expectPopupView(popup, launched.worker, page, "idle", tabId, 5_000);
      await popup.close();
      await page.bringToFront();
    });

    await enable(launched, popups, page, tabId);
    await expect
      .poll(() => framesIn(page, "#A-title"), POLL)
      .toEqual([{ inst: "", ns: "default", key: "home.title", close: false }]);

    await test.step("a second instance joins while the editor is active: both get ids, clicks stay apart", async () => {
      await page.evaluate(() => (globalThis as any).gateE.create("B", "core1"));
      await expect
        .poll(() => framesIn(page, "#A-title"), POLL)
        .toEqual([{ inst: "comvi-1", ns: "default", key: "home.title", close: false }]);
      await expect
        .poll(() => framesIn(page, "#B-title"), POLL)
        .toEqual([{ inst: "comvi-2", ns: "default", key: "home.title", close: false }]);
      await openEditor(page, "#B-title");
      await typeInto(page, "English", "B edited");
      await save(page);
      await expect.poll(() => visibleText(page, "#B-title"), POLL).toBe("B edited");
      expect(await visibleText(page, "#A-title")).toBe("Welcome home");
      await closeDialog(page);
    });
  });
});

test("several instances and two copies of core do not mix: each click edits its own instance", async () => {
  await withGateE({}, async (launched, popups) => {
    // A and B on /core/, C on /core2/: a second copy of core with its own modules.
    const { page, tabId } = await openSite(launched, "/app?instances=3");
    expect(await page.evaluate(() => (globalThis as any).__COMVI__.length)).toBe(3);
    expect(await page.evaluate(() => (globalThis as any).gateE.twoCopies())).toBe(true);
    await enable(launched, popups, page, tabId);

    await expect
      .poll(() => framesIn(page, "#C-title"), POLL)
      .toEqual([{ inst: "comvi-3", ns: "default", key: "home.title", close: false }]);
    expect(await framesIn(page, "#A-title")).toEqual([
      { inst: "comvi-1", ns: "default", key: "home.title", close: false },
    ]);
    expect(await framesIn(page, "#B-title")).toEqual([
      { inst: "comvi-2", ns: "default", key: "home.title", close: false },
    ]);

    for (const [region, text] of [
      ["C", "Third, edited"],
      ["A", "First, edited"],
    ] as const) {
      await openEditor(page, `#${region}-title`);
      // One project: the dialog shows the platform's value of the key, whatever the region.
      await expect(field(page, "English")).toBeVisible(POLL);
      await typeInto(page, "English", text);
      await save(page);
      await expect.poll(() => visibleText(page, `#${region}-title`), POLL).toBe(text);
      await closeDialog(page);
    }
    expect(await visibleText(page, "#B-title")).toBe("Second home");
    expect(await visibleText(page, "#C-title")).toBe("Third, edited");
    expect(await visibleText(page, "#A-title")).toBe("First, edited");
  });
});

test("a destroyed instance leaves the session: its stale text is not editable, the others are", async () => {
  await withGateE({}, async (launched, popups) => {
    const { page, tabId } = await openSite(launched, "/app?instances=2");
    const warnings: string[] = [];
    page.on("console", (message) => {
      if (message.type() === "warning") warnings.push(message.text());
    });
    await enable(launched, popups, page, tabId);
    await expect
      .poll(() => framesIn(page, "#B-title"), POLL)
      .toEqual([{ inst: "comvi-2", ns: "default", key: "home.title", close: false }]);

    await page.evaluate(() => (globalThis as any).gateE.destroy("B"));
    expect(await page.evaluate(() => (globalThis as any).__COMVI__.length)).toBe(1);

    await test.step("the destroyed instance's text names an instance that is gone", async () => {
      await page.locator("#B-title").click({ modifiers: ["Alt"] });
      await expect
        .poll(() => warnings.some((w) => w.includes('names instance "comvi-2"')), POLL)
        .toBe(true);
    });

    await test.step("the instance left on the page keeps its id and stays editable", async () => {
      // An issued id is not renumbered when another instance leaves (D5).
      expect(await framesIn(page, "#A-title")).toEqual([
        { inst: "comvi-1", ns: "default", key: "home.title", close: false },
      ]);
      await openEditor(page, "#A-title");
      await typeInto(page, "English", "Still here");
      await save(page);
      await expect.poll(() => visibleText(page, "#A-title"), POLL).toBe("Still here");
      await closeDialog(page);
    });

    await test.step("the popup counts what is left", async () => {
      const popup = await popupFor(launched, popups);
      await expectPopupView(popup, launched.worker, page, "active", tabId);
      await popup.close();
    });
  });
});

test("repeated enable loads once and adds nothing twice; disable removes the marking and the editor's DOM", async () => {
  await withGateE({}, async (launched, popups) => {
    const { page, tabId } = await openSite(launched, "/app");
    const before = await pageListeners(page);

    await enable(launched, popups, page, tabId);
    await expect.poll(() => framesIn(page, "#A-title"), POLL).toHaveLength(1);
    const once = await pageListeners(page);
    // The gate sees the editor's listeners: the highlighter's click capture is one of them.
    expect(before["document:click"]).toBeUndefined();
    expect(once["document:click"]).toBe(1);

    for (let round = 0; round < 2; round++) {
      await disable(launched, popups, page, tabId);
      await enable(launched, popups, page, tabId);
    }

    await test.step("one editor load for the whole session", async () => {
      expect(launched.cdn.requests).toHaveLength(1);
      expect(
        await page.evaluate(
          () => [...document.scripts].filter((s) => s.src.includes("cdn.jsdelivr.net")).length,
        ),
      ).toBe(1);
    });

    await test.step("one frame per string, one set of listeners", async () => {
      await expect
        .poll(() => framesIn(page, "#A-title"), POLL)
        .toEqual([{ inst: "", ns: "default", key: "home.title", close: false }]);
      expect(await framesIn(page, "#A-rich")).toHaveLength(2);
      expect(await pageListeners(page)).toEqual(once);
    });

    await test.step("disable: newly rendered output carries no frame, and the DOM is clean", async () => {
      await openEditor(page, "#A-title");
      await disable(launched, popups, page, tabId);
      await expect.poll(() => allFrames(page), POLL).toEqual([]);
      await page.evaluate(() => (globalThis as any).gateE.render());
      expect(await allFrames(page)).toEqual([]);
      expect(await editorDom(page)).toBe(0);
      expect(await page.evaluate(() => (globalThis as any).ComviInContextEditor.isActive())).toBe(
        false,
      );
      // The editor's own listeners are gone; the detector's stay (it serves the next Enable).
      expect(await pageListeners(page)).toEqual(before);
    });

    expect((await apiLog()).filter((entry) => entry.path.startsWith("/v1/context/"))).toEqual([]);
  });
});
