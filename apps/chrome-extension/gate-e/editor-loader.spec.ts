import { expect, test, type Browser, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  activateEditor,
  activeTabId,
  expectPopupView,
  launchGateE,
  openPopup,
  storedSession,
  waitForDetection,
} from "./helpers";

const ORIGIN = "http://127.0.0.1:8791";
const POLL = { timeout: 10_000 };

const packageVersion = (name: string): string =>
  JSON.parse(
    readFileSync(resolve(import.meta.dirname, `../../../packages/${name}/package.json`), "utf8"),
  ).version;
const CORE_VERSION = packageVersion("core");
const EDITOR_VERSION = packageVersion("plugin-in-context-editor");

/** The one URL the page's SDK may request: `@latest` with the hourly cache salt. */
const LATEST_EDITOR_URL =
  /^https:\/\/cdn\.jsdelivr\.net\/npm\/@comvi\/plugin-in-context-editor@latest\/dist\/standalone\.iife\.js\?comvi=\d+$/;

type Launched = Awaited<ReturnType<typeof launchGateE>>;

/**
 * The extension carries no editor. These specs load the REAL built
 * `@comvi/core` global (whose devtools capability installs the editor-loader
 * hook) and let it request the editor from jsDelivr, where the locally built
 * editor answers (helpers.ts `serveEditorFromLocalBuild`).
 */
async function openSite(launched: Launched, path: string, detected = true) {
  const page = await launched.context.newPage();
  await page.goto(`${ORIGIN}${path}`);
  await page.bringToFront();
  const tabId = await activeTabId(launched.worker);
  if (detected) await waitForDetection(launched.worker, tabId);
  return { page, tabId };
}

async function withGateE(
  options: Parameters<typeof launchGateE>[0],
  run: (launched: Launched, popups: Browser[]) => Promise<void>,
): Promise<void> {
  const launched = await launchGateE(options);
  try {
    await run(launched, []);
  } finally {
    await launched.context.close();
  }
}

const popupFor = (launched: Launched, popups: Browser[]) =>
  openPopup(launched.worker, launched.extensionId, launched.debuggingPort, popups);

/** Click Enable and wait for the popup's error line; the session must not survive. */
async function enableExpectingFailure(popup: Page, page: Page, launched: Launched, tabId: number) {
  await expectPopupView(popup, launched.worker, page, "idle", tabId);
  await popup.locator("#api-key").fill("gate-e-key");
  await popup.locator("#enable-btn").click();
  // The hook's own timeout is 10 s; a reason must be on screen well inside
  // the popup's 15 s budget.
  await expect(popup.locator("#error-msg")).toBeVisible({ timeout: 14_000 });
  await expect.poll(() => storedSession(launched.worker, tabId), POLL).toBeUndefined();
  return (await popup.locator("#error-msg").textContent()) ?? "";
}

/** Scripts on the page that do not come from the page's own origin. */
const foreignScripts = (page: Page) =>
  page.evaluate(() =>
    [...document.querySelectorAll("script[src]")]
      .map((script) => (script as HTMLScriptElement).src)
      .filter((src) => !src.startsWith(location.origin)),
  );

test("a site on the current SDK loads the editor itself when the user enables it", async () => {
  test.setTimeout(90_000);
  await withGateE({}, async (launched, popups) => {
    const { page, tabId } = await openSite(launched, "/site");

    await test.step("nothing is requested from the CDN before Enable", async () => {
      const popup = await popupFor(launched, popups);
      await expectPopupView(popup, launched.worker, page, "idle", tabId);
      await popup.close();
      await page.bringToFront();
      expect(launched.cdnRequests).toEqual([]);
      expect(await page.evaluate(() => "ComviInContextEditor" in globalThis)).toBe(false);
    });

    await test.step("Enable makes the page's SDK request the editor once, and it activates", async () => {
      const popup = await popupFor(launched, popups);
      await activateEditor(popup, page, launched.worker, tabId);
      await expect(popup.locator("#version-line")).toHaveText(
        `Comvi i18n v${CORE_VERSION} · editor v${EDITOR_VERSION}`,
      );
      await popup.close();
      await page.bringToFront();

      expect(launched.cdnRequests).toHaveLength(1);
      expect(launched.cdnRequests[0]).toMatch(LATEST_EDITOR_URL);
      // The script element is the page's own, pointing at the CDN: the
      // extension injected nothing.
      expect(await foreignScripts(page)).toEqual(launched.cdnRequests);
      expect(
        await page.evaluate(() => (globalThis as any).ComviInContextEditor.getStatus().hook),
      ).toEqual({ protocol: 1, sdkVersion: CORE_VERSION });
    });

    await test.step("a SPA route and a re-opened popup keep the session and load nothing again", async () => {
      await page.evaluate(() => history.pushState({}, "", "/site/route"));
      const popup = await popupFor(launched, popups);
      await expectPopupView(popup, launched.worker, page, "active", tabId);
      await popup.locator("#disable-btn").click();
      await expectPopupView(popup, launched.worker, page, "idle", tabId);
      await expect.poll(() => storedSession(launched.worker, tabId), POLL).toBeUndefined();

      await activateEditor(popup, page, launched.worker, tabId);
      await popup.close();
      expect(launched.cdnRequests).toHaveLength(1);
    });
  });
});

test("a page that loads the editor itself gains nothing until the popup activates", async () => {
  await withGateE({}, async (launched, popups) => {
    const { page, tabId } = await openSite(launched, "/site");

    const result = await page.evaluate(() =>
      (globalThis as any)[Symbol.for("comvi.devtools.editorLoader")].load(),
    );
    expect(result).toMatchObject({ ok: true, protocol: 1 });
    expect(await page.evaluate(() => typeof (globalThis as any).ComviInContextEditor)).toBe(
      "object",
    );

    // The editor is on the page, with no session and no proxy authority.
    expect(await page.evaluate(() => (globalThis as any).ComviInContextEditor.isActive())).toBe(
      false,
    );
    expect(await storedSession(launched.worker, tabId)).toBeUndefined();

    // Activation is still the popup's, and it reuses the loaded editor.
    const popup = await popupFor(launched, popups);
    await activateEditor(popup, page, launched.worker, tabId);
    await popup.close();
    expect(launched.cdnRequests).toHaveLength(1);
  });
});

test("a script-src that does not allow the CDN is named in the popup with its remedy", async () => {
  await withGateE({}, async (launched, popups) => {
    const { page, tabId } = await openSite(launched, "/csp-script");
    const popup = await popupFor(launched, popups);

    const error = await enableExpectingFailure(popup, page, launched, tabId);

    expect(error).toBe(
      "This site's Content Security Policy blocked the editor. Allow https://cdn.jsdelivr.net in its script-src directive, then reload this page. The editor does not run yet on a site that enforces Trusted Types.",
    );
    // The policy stopped the request before it left the page.
    expect(launched.cdnRequests).toEqual([]);
    expect(await page.evaluate(() => "ComviInContextEditor" in globalThis)).toBe(false);
    await popup.close();
  });
});

test("an unreachable CDN is named in the popup as a download failure", async () => {
  await withGateE({ cdn: "unreachable" }, async (launched, popups) => {
    const { page, tabId } = await openSite(launched, "/site");
    const popup = await popupFor(launched, popups);

    const error = await enableExpectingFailure(popup, page, launched, tabId);

    expect(error).toBe(
      "The editor could not be downloaded from cdn.jsdelivr.net. Check your connection and any filter that blocks that host, then try again. If the site pins an editor version, check that the version exists.",
    );
    expect(launched.cdnRequests).toHaveLength(1);
    await popup.close();
  });
});

test("under style-src 'self' the editor loads and renders styled, with no style violation", async () => {
  test.setTimeout(90_000);
  await withGateE({}, async (launched, popups) => {
    const { page, tabId } = await openSite(launched, "/csp-style");
    const popup = await popupFor(launched, popups);
    await activateEditor(popup, page, launched.worker, tabId);
    await popup.close();
    await page.bringToFront();

    /** State of the editor's shadow roots, read from the page. */
    const editorUi = () =>
      page.evaluate(() => {
        const roots = [...document.querySelectorAll("*")]
          .map((element) => element.shadowRoot)
          .filter((root): root is ShadowRoot => root !== null);
        const buttons = roots.flatMap((root) => [...root.querySelectorAll("button")]);
        const viewport = roots
          .map((root) => root.querySelector("[data-reka-select-viewport]"))
          .find((element) => element !== null);
        return {
          roots: roots.length,
          styleElements: roots.reduce((n, root) => n + root.querySelectorAll("style").length, 0),
          adoptedSheets: roots.map((root) => root.adoptedStyleSheets.length),
          presetTrigger: buttons.some((button) =>
            /Gender|Formality/.test(button.textContent ?? ""),
          ),
          presetViewport: viewport ? getComputedStyle(viewport).scrollbarWidth : null,
          // Tailwind's border utilities: `none` when the stylesheet is missing.
          styledBorders: roots
            .flatMap((root) => [...root.querySelectorAll("div")])
            .filter((div) => getComputedStyle(div).borderBlockEndStyle === "solid").length,
        };
      });

    await test.step("open the edit modal on a translated string", async () => {
      // The editor marks strings rendered after it became active, and learns
      // of the new text asynchronously: click until the modal mounts.
      await page.evaluate(() => (globalThis as any).renderGreeting());
      await expect
        .poll(async () => {
          if ((await editorUi()).roots > 0) return true;
          await page.evaluate(() =>
            document.getElementById("greeting")!.dispatchEvent(
              new MouseEvent("click", {
                bubbles: true,
                cancelable: true,
                altKey: true,
                composed: true,
              }),
            ),
          );
          return false;
        }, POLL)
        .toBe(true);
      await expect.poll(async () => (await editorUi()).presetTrigger, POLL).toBe(true);
    });

    await test.step("open the Preset dropdown", async () => {
      await page.evaluate(() => {
        for (const element of document.querySelectorAll("*")) {
          const trigger = [...(element.shadowRoot?.querySelectorAll("button") ?? [])].find(
            (button) => /Gender|Formality/.test(button.textContent ?? ""),
          );
          // reka-ui's select opens on pointerdown; a bare click does not.
          trigger?.dispatchEvent(
            new PointerEvent("pointerdown", { bubbles: true, button: 0, pointerType: "mouse" }),
          );
          trigger?.click();
        }
      });
      await expect.poll(async () => (await editorUi()).presetViewport, POLL).not.toBeNull();
    });

    const ui = await editorUi();
    // Styles arrive through an adopted stylesheet, never a <style> element...
    expect(ui.styleElements).toBe(0);
    expect(ui.adoptedSheets.every((count) => count === 1)).toBe(true);
    // ...and they apply: the modal has its borders, the dropdown its hidden scrollbar.
    expect(ui.styledBorders).toBeGreaterThan(0);
    expect(ui.presetViewport).toBe("none");
    // Not one blocked style, and nothing else blocked either.
    expect(await page.evaluate(() => (globalThis as any).__CSP_VIOLATIONS__)).toEqual([]);
  });
});

test("a site on @comvi/core 0.5.0 is told to upgrade, and Enable is not offered", async () => {
  await withGateE({}, async (launched, popups) => {
    const { page, tabId } = await openSite(launched, "/old-sdk");
    const popup = await popupFor(launched, popups);

    await expectPopupView(popup, launched.worker, page, "not-detected", tabId);
    await expect(popup.locator("#reason-title")).toHaveText(
      "Comvi i18n v0.5.0 found, but it cannot load the editor.",
    );
    await expect(popup.locator("#reason-remedy")).toHaveText(
      "In-context editing needs @comvi/core 0.6.0 or newer with .use(devtools()) on the i18n instance. Upgrade the site's Comvi packages, then reload this page.",
    );
    await expect(popup.locator("#enable-btn")).toBeHidden();
    expect(launched.cdnRequests).toEqual([]);
    await popup.close();
  });
});

test("a site without devtools() is told what to add", async () => {
  await withGateE({}, async (launched, popups) => {
    const { page, tabId } = await openSite(launched, "/no-devtools", false);
    const popup = await popupFor(launched, popups);

    await expectPopupView(popup, launched.worker, page, "not-detected", tabId);
    await expect(popup.locator("#reason-title")).toHaveText(
      "Comvi i18n not detected on this page.",
    );
    await expect(popup.locator("#reason-remedy")).toContainText(
      "add .use(devtools()) to its i18n instance (@comvi/core 0.6.0 or newer)",
    );
    await expect(popup.locator("#enable-btn")).toBeHidden();
    await popup.close();
  });
});
