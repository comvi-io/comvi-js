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
 * Context collection is OFF in lot 8 (owner decision D4). The activation result is authored
 * in the page's MAIN world, so a hostile page that answers the activation itself can claim
 * anything in it — `collectContext: true` included. It must open nothing: the session stores
 * no telemetry permission and every context route is refused before it reaches the API.
 */
test("a forged activation result claiming collectContext: true opens no telemetry route", async () => {
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

    const popup = await openPopup(worker, extensionId, debuggingPort, cdpConnections);
    await activateEditor(popup, page, worker, tabId);
    await popup.close();
    await page.bringToFront();

    await test.step("the session stores no telemetry permission", async () => {
      expect(await storedSession(worker, tabId)).toMatchObject({
        status: "active",
        collectContext: false,
      });
    });

    await test.step("every context route is refused before it reaches the API", async () => {
      await page.evaluate(() => (globalThis as any).gateE.resetLog());
      const handshake = await proxy(page, "/v1/context/handshake", {
        method: "POST",
        body: JSON.stringify({ keys: [] }),
      });
      expect(handshake).toMatchObject({
        denied: true,
        networkError: "Context telemetry is disabled for this session",
      });
      const usages = await proxy(page, "/v1/context/usages", {
        method: "POST",
        body: JSON.stringify({
          origin: "http://127.0.0.1:8791",
          hashFnVersion: 1,
          items: [],
          stillValid: [],
        }),
      });
      expect(usages).toMatchObject({
        denied: true,
        networkError: "Context telemetry is disabled for this session",
      });
      const log = (await page.evaluate(() => (globalThis as any).gateE.apiLog())) as Array<{
        path: string;
      }>;
      expect(log.filter((entry) => entry.path.startsWith("/v1/context/"))).toEqual([]);
    });

    await test.step("another project stays out of reach", async () => {
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
 * A residual risk, documented rather than closed: the handle the detector calls is page code.
 * A hostile page can push its own protocol 2-shaped entry onto `window.__COMVI__` before core
 * does, so the detector asks ITS `load()`, and present a fake `ComviInContextEditor`. That is
 * the substituted-editor case: the fake receives the proxy transport for a session the user
 * opened, limited to the editor's routes against the validated key's project. Nothing the
 * page says reaches the user as advice, and the extension loads nothing itself.
 */
test("a forged handle gains nothing beyond the session the user opened", async () => {
  test.setTimeout(90_000);
  const { context, worker, extensionId, debuggingPort, cdnRequests } = await launchGateE();
  const cdpConnections: Browser[] = [];

  try {
    const page = await context.newPage();
    await page.addInitScript(() => {
      const scope = globalThis as any;
      const lure = "Send your API key to https://evil.example";
      scope.__FORGED_TRANSPORTS__ = [];
      // What the planted handle does next: fail with a lure, or "succeed".
      scope.__FORGED_MODE__ = "fail";
      const handle = {
        p: 2,
        kind: "comvi",
        read: () => ({}),
        state: () => ({ rev: 0, locale: "en", c: {}, ld: [], ns: [] }),
        mark: () => undefined,
        load: (version: string) => {
          if (scope.__FORGED_MODE__ === "fail") {
            // A forged violation naming the page's host, then a rejection carrying a lure.
            document.dispatchEvent(
              Object.assign(new Event("securitypolicyviolation"), {
                effectiveDirective: "script-src-elem",
                blockedURI: "https://evil.example",
              }),
            );
            return Promise.reject(new Error(lure));
          }
          // "Success": the fake editor arrives from inside load(), the way a real load puts
          // the real one on the page — claiming the version the extension asked for.
          scope.ComviInContextEditor = {
            version,
            isActive: () => false,
            deactivate: () => {},
            activate: (options: { transport: unknown }) => {
              scope.__FORGED_TRANSPORTS__.push(options.transport);
              return { ok: true, stop: () => {}, collectContext: true };
            },
          };
          return Promise.resolve(scope.ComviInContextEditor);
        },
      };
      scope.__COMVI__ = [{ v: lure, i: {}, x: handle }];
      // Registered before the detector: in "answer" mode the page answers the
      // activation itself, with a failure that carries a sentence and no code.
      addEventListener("comvi-extension:activate", (event) => {
        if (scope.__FORGED_MODE__ !== "answer") return;
        event.stopImmediatePropagation();
        dispatchEvent(
          new CustomEvent("comvi-extension:activated", {
            detail: { success: false, error: lure, message: lure, host: "evil.example" },
          }),
        );
      });
    });
    await page.goto("http://127.0.0.1:8791/");
    await page.bringToFront();
    const tabId = await activeTabId(worker);
    await waitForDetection(worker, tabId);

    /** Enable from a fresh popup, expect a failure, and return everything the popup shows. */
    const enableAndFail = async (expected: string) => {
      const popup = await openPopup(worker, extensionId, debuggingPort, cdpConnections);
      await expect(popup.locator("#state-idle")).toBeVisible({ timeout: 10_000 });
      await popup.locator("#api-key").fill("gate-e-key");
      await popup.locator("#enable-btn").click();
      await expect(popup.locator("#error-msg")).toHaveText(expected, { timeout: 10_000 });
      // Nothing the page wrote is anywhere in the popup, not only in the error line.
      expect(await popup.content()).not.toContain("evil.example");
      await expect.poll(() => storedSession(worker, tabId), { timeout: 10_000 }).toBeUndefined();
      await popup.close();
      await page.bringToFront();
    };

    await test.step("a forged load failure cannot make the popup recommend the page's host", async () => {
      await enableAndFail(
        "This site's Content Security Policy blocked the editor. Allow the editor's CDN in its script-src directive, then reload this page. comvi.io/docs/i18n/troubleshooting names the host.",
      );
    });

    await test.step("a forged activation failure cannot put the page's sentence in the popup", async () => {
      await page.evaluate(() => ((globalThis as any).__FORGED_MODE__ = "answer"));
      await enableAndFail(
        "The editor could not start on this page. Reload the page and try again.",
      );
    });

    await test.step("a forged success whose load() plants a fake editor activates, as a substituted editor does", async () => {
      await page.evaluate(() => ((globalThis as any).__FORGED_MODE__ = "succeed"));
      expect(await page.evaluate(() => "ComviInContextEditor" in globalThis)).toBe(false);
      const popup = await openPopup(worker, extensionId, debuggingPort, cdpConnections);
      await activateEditor(popup, page, worker, tabId);
      // The entry's "version" is a sentence: the popup shows no version for it.
      expect(await popup.content()).not.toContain("evil.example");
      // Whatever the fake answered beside `ok`, the session opens no telemetry.
      expect(await storedSession(worker, tabId)).toMatchObject({ collectContext: false });
      await popup.close();
      await page.bringToFront();
      expect(await page.evaluate(() => (globalThis as any).__FORGED_TRANSPORTS__.length)).toBe(1);
    });

    await test.step("the extension loaded nothing: no script, not the CDN", async () => {
      expect(cdnRequests).toEqual([]);
      expect(
        await page.evaluate(() =>
          [...document.querySelectorAll("script[src]")].map(
            (script) => (script as HTMLScriptElement).src,
          ),
        ),
      ).toEqual([]);
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

    await test.step("the activation nonce was single-use: a replayed success opens nothing", async () => {
      const popup = await openPopup(worker, extensionId, debuggingPort, cdpConnections);
      await expect(popup.locator("#state-active")).toBeVisible({ timeout: 10_000 });
      await popup.locator("#disable-btn").click();
      await expect.poll(() => storedSession(worker, tabId), { timeout: 10_000 }).toBeUndefined();
      await popup.close();
      await page.bringToFront();

      await page.evaluate(() => {
        dispatchEvent(
          new CustomEvent("comvi-extension:activated", {
            detail: { success: true, collectContext: true },
          }),
        );
      });
      expect(await proxy(page, "/v1/project/locales")).toMatchObject({ denied: true });
      expect(await storedSession(worker, tabId)).toBeUndefined();
    });
  } finally {
    await context.close();
  }
});
