import { expect, test, type Browser, type Page } from "@playwright/test";
import {
  activateEditor,
  activeTabId,
  launchGateE,
  openPopup,
  storedSession,
  waitForDetection,
} from "./helpers";

type ProxyResult = { denied: boolean; networkError?: string; reason?: string };

function proxy(
  page: Page,
  path: string,
  options: { method?: string; body?: string } = {},
): Promise<ProxyResult> {
  return page.evaluate(([target, init]) => (globalThis as any).gateE.proxy(target, init), [
    path,
    options,
  ] as const);
}

/**
 * Documents a residual risk rather than a boundary: the activation result,
 * including its `collectContext` flag, is authored in the page's MAIN world.
 * The nonce proves that the user started this activation, not what the
 * site's configuration says. A hostile page that answers first can report
 * `collectContext: true` although its i18n instance has `collectContext:
 * false`, and the session then opens the telemetry routes. It still cannot
 * report for another origin, reach another project or see the key.
 */
test("a forged activation result can enable telemetry for its own origin only", async () => {
  test.setTimeout(60_000);
  const { context, worker, extensionId, debuggingPort } = await launchGateE();
  const cdpConnections: Browser[] = [];

  try {
    const page = await context.newPage();
    // Runs while the page parses, before the MAIN-world detector registers at
    // document_idle: the page answers the activation itself and keeps the
    // command from ever reaching the detector, so no honest result follows.
    await page.addInitScript(() => {
      addEventListener("comvi-extension:activate", (event) => {
        event.stopImmediatePropagation();
        dispatchEvent(
          new CustomEvent("comvi-extension:activated", {
            detail: { success: true, collectContext: true },
          }),
        );
      });
    });
    await page.goto("http://127.0.0.1:8791/");
    await page.bringToFront();
    const tabId = await activeTabId(worker);
    await waitForDetection(worker, tabId);

    // The harness's i18n instance is configured with collectContext: false.
    expect(await page.evaluate(() => (globalThis as any).__COMVI__?.get?.()?.collectContext)).toBe(
      false,
    );

    const popup = await openPopup(worker, extensionId, debuggingPort, cdpConnections);
    await activateEditor(popup, page, worker, tabId);
    await popup.close();
    await page.bringToFront();

    await test.step("the forged flag is what the session stores", async () => {
      expect(await storedSession(worker, tabId)).toMatchObject({
        status: "active",
        collectContext: true,
      });
    });

    await test.step("telemetry for the page's own origin reaches the API", async () => {
      await page.evaluate(() => (globalThis as any).gateE.resetLog());
      const handshake = await proxy(page, "/v1/context/handshake", {
        method: "POST",
        body: JSON.stringify({ keys: [] }),
      });
      expect(handshake).toMatchObject({ denied: false });
      const log = (await page.evaluate(() => (globalThis as any).gateE.apiLog())) as Array<{
        path: string;
        auth: string | null;
      }>;
      expect(log.filter((entry) => entry.path === "/v1/context/handshake")).toHaveLength(1);
    });

    await test.step("it still cannot report for another origin or reach another project", async () => {
      const otherOrigin = await proxy(page, "/v1/context/usages", {
        method: "POST",
        body: JSON.stringify({
          origin: "https://victim.example",
          hashFnVersion: 1,
          items: [],
          stillValid: [],
        }),
      });
      expect(otherOrigin).toMatchObject({
        denied: true,
        networkError: "Telemetry origin mismatch",
      });

      const otherProject = await proxy(page, "/v1/projects/9999/export");
      expect(otherProject).toMatchObject({
        denied: true,
        networkError: "Project id does not match this session",
      });
    });

    await test.step("and the page never holds the key", async () => {
      const pageEgress = (await page.evaluate(() => (globalThis as any).__PAGE_EGRESS__)) as Array<{
        hasAuth: boolean;
      }>;
      expect(pageEgress.filter((entry) => entry.hasAuth)).toEqual([]);
    });
  } finally {
    await context.close();
  }
});

/**
 * The same residual risk through the editor-loader hook. The hook the
 * detector calls is page code, so a hostile page can plant its own before
 * @comvi/core loads (core keeps an existing hook of the same protocol), answer
 * `ok: true` and present a fake `ComviInContextEditor`. That is today's
 * substituted-editor case, no more: the fake receives the proxy transport for
 * a session the user opened, limited to the editor's routes against the
 * validated key's project. Nothing the hook says reaches the user as advice.
 */
test("a forged editor-loader hook gains nothing beyond the session the user opened", async () => {
  test.setTimeout(90_000);
  const { context, worker, extensionId, debuggingPort, cdnRequests } = await launchGateE();
  const cdpConnections: Browser[] = [];

  try {
    const page = await context.newPage();
    await page.addInitScript(() => {
      const scope = globalThis as any;
      scope.__FORGED_LOAD__ = { ok: false, code: "csp-blocked", host: "evil.example" };
      scope.__FORGED_TRANSPORTS__ = [];
      scope[Symbol.for("comvi.devtools.editorLoader")] = {
        protocol: 1,
        sdkVersion: "9.9.9",
        editorVersion: "latest",
        url: "https://evil.example/editor.js",
        load: () => Promise.resolve(scope.__FORGED_LOAD__),
      };
    });
    await page.goto("http://127.0.0.1:8791/");
    await page.bringToFront();
    const tabId = await activeTabId(worker);
    await waitForDetection(worker, tabId);

    await test.step("a forged failure cannot make the popup recommend the page's host", async () => {
      const popup = await openPopup(worker, extensionId, debuggingPort, cdpConnections);
      await expect(popup.locator("#state-idle")).toBeVisible({ timeout: 10_000 });
      await popup.locator("#api-key").fill("gate-e-key");
      await popup.locator("#enable-btn").click();
      await expect(popup.locator("#error-msg")).toContainText("https://cdn.jsdelivr.net", {
        timeout: 10_000,
      });
      expect(await popup.content()).not.toContain("evil.example");
      await expect.poll(() => storedSession(worker, tabId), { timeout: 10_000 }).toBeUndefined();
      await popup.close();
      await page.bringToFront();
    });

    await test.step("a forged success with a fake editor activates, as a substituted editor does today", async () => {
      await page.evaluate(() => {
        const scope = globalThis as any;
        scope.__FORGED_LOAD__ = { ok: true, host: "evil.example" };
        scope.ComviInContextEditor = {
          version: "9.9.9",
          isActive: () => false,
          deactivate: () => {},
          activate: (options: { transport: unknown }) => {
            scope.__FORGED_TRANSPORTS__.push(options.transport);
            return { instanceId: "forged", collectContext: false };
          },
        };
      });
      const popup = await openPopup(worker, extensionId, debuggingPort, cdpConnections);
      await activateEditor(popup, page, worker, tabId);
      await popup.close();
      await page.bringToFront();
      expect(await page.evaluate(() => (globalThis as any).__FORGED_TRANSPORTS__.length)).toBe(1);
    });

    await test.step("the extension loaded nothing: not the forged url, not the CDN", async () => {
      expect(cdnRequests).toEqual([]);
      expect(
        await page.evaluate(() =>
          [...document.querySelectorAll("script[src]")].map(
            (script) => (script as HTMLScriptElement).src,
          ),
        ),
      ).toEqual(["http://127.0.0.1:8791/__core.js"]);
    });

    await test.step("the fake editor reaches the editor's own routes for this project only", async () => {
      await page.evaluate(() => (globalThis as any).gateE.resetLog());
      expect(await proxy(page, "/v1/project/locales")).toMatchObject({ denied: false });

      expect(await proxy(page, "/v1/organizations")).toMatchObject({ denied: true });
      expect(await proxy(page, "/v1/api-keys")).toMatchObject({ denied: true });
      expect(await proxy(page, "/v1/projects/9999/export")).toMatchObject({
        denied: true,
        networkError: "Project id does not match this session",
      });
      const telemetry = await proxy(page, "/v1/context/handshake", {
        method: "POST",
        body: JSON.stringify({ keys: [] }),
      });
      expect(telemetry).toMatchObject({ denied: true });

      const log = (await page.evaluate(() => (globalThis as any).gateE.apiLog())) as Array<{
        path: string;
      }>;
      expect(log.map((entry) => entry.path)).toEqual(["/v1/project/locales"]);
    });

    await test.step("and the page never holds the key", async () => {
      const pageEgress = (await page.evaluate(() => (globalThis as any).__PAGE_EGRESS__)) as Array<{
        hasAuth: boolean;
      }>;
      expect(pageEgress.filter((entry) => entry.hasAuth)).toEqual([]);
    });
  } finally {
    await context.close();
  }
});
