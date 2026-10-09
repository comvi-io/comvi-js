import {
  expect,
  test,
  type Browser,
  type CDPSession,
  type Page,
  type Worker,
} from "@playwright/test";
import {
  activateEditor,
  activeTabId,
  launchGateE,
  openPopup,
  storedSession,
  waitForDetection,
} from "./helpers";

const POLL = { timeout: 10_000 };
const HOSTILE_PAGE = "http://127.0.0.1:8791/";

type ProxyResult = { denied: boolean; networkError?: string; reason?: string };

function proxy(page: Page, path = "/v1/project/locales"): Promise<ProxyResult> {
  return page.evaluate((target) => (globalThis as any).gateE.proxy(target), path);
}

function badgeText(worker: Worker, tabId: number): Promise<string> {
  return worker.evaluate((id) => {
    const chromeApi = (globalThis as typeof globalThis & { chrome: typeof chrome }).chrome;
    return chromeApi.action.getBadgeText({ tabId: id });
  }, tabId);
}

/**
 * Evaluate in this extension's content-script (isolated) world, which
 * Playwright does not expose directly; the bridge runs there.
 */
async function evaluateInBridgeWorld(
  cdp: CDPSession,
  contextIds: Map<number, string>,
  expression: string,
): Promise<unknown> {
  const contextId = [...contextIds].findLast(([, name]) => name === "Comvi In-Context Editor")?.[0];
  if (contextId === undefined) throw new Error("The bridge's isolated world was not found");
  const { result } = await cdp.send("Runtime.evaluate", {
    contextId,
    expression,
    awaitPromise: true,
    returnByValue: true,
  });
  return result.value;
}

test("top-level navigation revokes authority even where no content script runs, and a restored document needs fresh activation", async () => {
  test.setTimeout(90_000);
  const { context, worker, extensionId, debuggingPort } = await launchGateE({
    backForwardCache: true,
  });
  const cdpConnections: Browser[] = [];

  try {
    const page = await context.newPage();
    const cdp = await context.newCDPSession(page);
    const isolatedWorlds = new Map<number, string>();
    cdp.on("Runtime.executionContextCreated", ({ context: created }) => {
      if (created.auxData?.type === "isolated") isolatedWorlds.set(created.id, created.name);
    });
    await cdp.send("Runtime.enable");
    await page.goto(HOSTILE_PAGE);
    await page.bringToFront();
    const tabId = await activeTabId(worker);
    await waitForDetection(worker, tabId);

    await test.step("enable the editor and confirm the proxy works", async () => {
      const popup = await openPopup(worker, extensionId, debuggingPort, cdpConnections);
      await activateEditor(popup, page, worker, tabId);
      await popup.close();
      await page.bringToFront();
      expect(await proxy(page)).toMatchObject({ denied: false });
      expect(await badgeText(worker, tabId)).toBe("ON");
      await page.evaluate(() => {
        (globalThis as any).__gateEDocumentMarker = "cached-document";
      });
    });

    await test.step("the saved key is not readable from the extension's content-script world", async () => {
      const read = await evaluateInBridgeWorld(
        cdp,
        isolatedWorlds,
        `chrome.storage.local.get(null).then(
          (items) => "READ " + JSON.stringify(items),
          (error) => "DENIED " + error.message,
        )`,
      );
      expect(read).toMatch(/^DENIED /);
    });

    await test.step("navigating to a page with no content script revokes the session and the badge", async () => {
      // about:blank matches no content script, so no DOCUMENT_READY arrives.
      await page.goto("about:blank");
      await expect.poll(() => storedSession(worker, tabId), POLL).toBeUndefined();
      await expect.poll(() => badgeText(worker, tabId), POLL).toBe("");
    });

    await test.step("a document restored from the back/forward cache resumes no authority", async () => {
      await page.goBack({ waitUntil: "commit" });
      await page.waitForFunction(() => (globalThis as any).gateE !== undefined);
      // Precondition: this really is the cached document, not a fresh load.
      expect(await page.evaluate(() => (globalThis as any).__gateEDocumentMarker)).toBe(
        "cached-document",
      );
      // The cached editor runtime is torn down, so it cannot keep editing.
      await expect
        .poll(
          () => page.evaluate(() => (globalThis as any).ComviInContextEditor?.isActive?.()),
          POLL,
        )
        .toBe(false);
      expect(await storedSession(worker, tabId)).toBeUndefined();

      await page.evaluate(() => (globalThis as any).gateE.resetLog());
      expect(await proxy(page)).toMatchObject({ denied: true });
      const log = (await page.evaluate(() => (globalThis as any).gateE.apiLog())) as Array<{
        path: string;
      }>;
      expect(log.filter((entry) => entry.path.startsWith("/v1/project/locales"))).toEqual([]);
    });

    await test.step("the restored document can be enabled again from the popup", async () => {
      await page.bringToFront();
      const popup = await openPopup(worker, extensionId, debuggingPort, cdpConnections);
      await activateEditor(popup, page, worker, tabId);
      await popup.close();
      await page.bringToFront();
      expect(await proxy(page)).toMatchObject({ denied: false });
    });
  } finally {
    await context.close();
  }
});
