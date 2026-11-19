import type { Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { EDITOR_URL, EDITOR_VERSION, expectPopupView, storedSession } from "./helpers";
import {
  closeDialog,
  dialog,
  enable,
  enableExpectingFailure,
  expect,
  framesIn,
  openEditor,
  openSite,
  POLL,
  popupFor,
  test,
  visibleText,
  withGateE,
  type Launched,
} from "./site";

test.describe.configure({ timeout: 90_000 });

const CORE_VERSION: string = JSON.parse(
  readFileSync(resolve(import.meta.dirname, "../../../packages/core/package.json"), "utf8"),
).version;

/** The popup's texts (popup.ts): every word is the extension's own. */
const TEXT = {
  csp: "This site's Content Security Policy blocked the editor. Allow the editor's CDN in its script-src directive, then reload this page. comvi.io/docs/i18n/troubleshooting names the host.",
  trustedTypes:
    "This site enforces Trusted Types, and no policy let the editor's script through. Add a default policy that accepts the editor's script URL, then reload this page. comvi.io/docs/i18n/troubleshooting has the details.",
  loadError:
    "The editor could not be downloaded from its CDN. Check your connection and any filter that blocks it, then try again.",
  timeout:
    "The editor did not finish loading from its CDN in time. Check your connection and try again.",
  noGlobal:
    "The editor's CDN answered, but what it sent did not start the Comvi editor. Try again. If it keeps happening, a proxy or filter is rewriting the script.",
  oldTitle: (version: string) => `Comvi i18n v${version} found, but it is older than 0.8.`,
  oldRemedy:
    "In-context editing needs @comvi/core 0.8 or newer with plugins: [devtools()] on the i18n instance. Upgrade the site's Comvi packages, then reload this page.",
  newerTitle: "This site runs a newer Comvi i18n than this extension supports.",
  newerRemedy:
    "Update the Comvi In-Context Editor extension, then reload this page. Until then the editor is not offered here.",
};

/** The page's own behaviour after a failure: its text renders and its button counts. */
async function expectAppWorks(page: Page) {
  expect(await visibleText(page, "#A-title")).toBe("Welcome home");
  expect(await page.evaluate(() => (globalThis as any).gateE.appWorks())).toBe("1");
  expect(await page.evaluate(() => "ComviInContextEditor" in globalThis)).toBe(false);
}

/** Script elements whose source is not the page's own origin. */
const foreignScripts = (page: Page) =>
  page.evaluate(() =>
    [...document.scripts]
      .map((script) => script.src)
      .filter((src) => !src.startsWith(location.origin)),
  );

test("Enable makes the page's core load exactly the editor version the extension was built with, once", async () => {
  await withGateE({}, async (launched, popups) => {
    const { page, tabId } = await openSite(launched, "/app");

    await test.step("nothing is requested before Enable", async () => {
      const popup = await popupFor(launched, popups);
      await expectPopupView(popup, launched.worker, page, "idle", tabId);
      await popup.close();
      await page.bringToFront();
      expect(launched.cdn.requests).toEqual([]);
      expect(await page.evaluate(() => "ComviInContextEditor" in globalThis)).toBe(false);
    });

    await test.step("Enable: one request, for the exact version, and the editor activates", async () => {
      const popup = await popupFor(launched, popups);
      const { activateEditor } = await import("./helpers");
      await activateEditor(popup, page, launched.worker, tabId);
      await expect(popup.locator("#version-line")).toHaveText(
        `Comvi i18n v${CORE_VERSION} · editor v${EDITOR_VERSION}`,
      );
      await popup.close();
      await page.bringToFront();
      expect(launched.cdn.requests).toEqual([EDITOR_URL]);
      // The script element is the page's core's: the extension inserted none.
      expect(await foreignScripts(page)).toEqual([EDITOR_URL]);
    });

    await test.step("a client route keeps the session and loads nothing again", async () => {
      await page.evaluate(() => history.pushState({}, "", "/app/route"));
      const popup = await popupFor(launched, popups);
      await expectPopupView(popup, launched.worker, page, "active", tabId);
      await popup.close();
      expect(launched.cdn.requests).toHaveLength(1);
    });
  });
});

test("a script-src that does not allow the CDN is named in the popup, and the app keeps working", async () => {
  await withGateE({}, async (launched, popups) => {
    const { page, tabId } = await openSite(launched, "/app-csp-script");
    expect(await enableExpectingFailure(launched, popups, page, tabId)).toBe(TEXT.csp);
    // The policy stopped the request before it left the page.
    expect(launched.cdn.requests).toEqual([]);
    await expectAppWorks(page);
  });
});

test("Trusted Types without a policy is named in the popup, and the app keeps working", async () => {
  await withGateE({}, async (launched, popups) => {
    const { page, tabId } = await openSite(launched, "/app-tt-none");
    expect(await enableExpectingFailure(launched, popups, page, tabId)).toBe(TEXT.trustedTypes);
    expect(launched.cdn.requests).toEqual([]);
    await expectAppWorks(page);
  });
});

test("Trusted Types with a default policy for the editor URL loads the editor and opens its dialog", async () => {
  await withGateE({}, async (launched, popups) => {
    const { page, tabId } = await openSite(launched, "/app-tt-policy");
    await enable(launched, popups, page, tabId);
    expect(launched.cdn.requests).toEqual([EDITOR_URL]);
    await openEditor(page, "#A-title");
    await expect(dialog(page)).toContainText("home.title");
    await closeDialog(page);
  });
});

test("under style-src 'self' the editor loads and its dialog renders styled", async () => {
  await withGateE({}, async (launched, popups) => {
    const { page, tabId } = await openSite(launched, "/app-csp-style");
    const violations: string[] = [];
    await page.exposeFunction("__reportViolation", (directive: string) =>
      violations.push(directive),
    );
    await page.evaluate(() =>
      document.addEventListener("securitypolicyviolation", (event) =>
        (globalThis as any).__reportViolation(event.effectiveDirective),
      ),
    );
    await enable(launched, popups, page, tabId);
    await openEditor(page, "#A-title");
    const ui = await page.evaluate(() => {
      const roots = [...document.querySelectorAll("[data-comvi-editor-ui-shadow-host]")]
        .map((host) => host.shadowRoot)
        .filter((root): root is ShadowRoot => root !== null);
      return {
        roots: roots.length,
        styleElements: roots.reduce((n, root) => n + root.querySelectorAll("style").length, 0),
        adoptedSheets: roots.map((root) => root.adoptedStyleSheets.length),
        styledBorders: roots
          .flatMap((root) => [...root.querySelectorAll("div")])
          .filter((div) => getComputedStyle(div).borderBlockEndStyle === "solid").length,
      };
    });
    expect(ui.roots).toBeGreaterThan(0);
    expect(ui.styleElements).toBe(0);
    expect(ui.adoptedSheets.every((count) => count === 1)).toBe(true);
    expect(ui.styledBorders).toBeGreaterThan(0);
    expect(violations).toEqual([]);
    await closeDialog(page);
  });
});

for (const [mode, text] of [
  ["unreachable", TEXT.loadError],
  ["not-found", TEXT.loadError],
  ["throws", TEXT.noGlobal],
  ["no-global", TEXT.noGlobal],
] as const) {
  test(`a CDN that answers "${mode}" is named in the popup; the app keeps working; the retry loads`, async () => {
    await withGateE({ cdn: mode }, async (launched, popups) => {
      const { page, tabId } = await openSite(launched, "/app");
      expect(await enableExpectingFailure(launched, popups, page, tabId)).toBe(text);
      expect(launched.cdn.requests).toEqual([EDITOR_URL]);
      await expectAppWorks(page);

      // A failed load is not kept: the next Enable asks the core again.
      launched.cdn.mode = "local-build";
      await enable(launched, popups, page, tabId);
      expect(launched.cdn.requests).toEqual([EDITOR_URL, EDITOR_URL]);
      await expect.poll(() => framesIn(page, "#A-title"), POLL).toHaveLength(1);
    });
  });
}

test("a CDN that never answers ends in the load's time limit, named in the popup", async () => {
  await withGateE({ cdn: "never" }, async (launched, popups) => {
    const { page, tabId } = await openSite(launched, "/app");
    expect(await enableExpectingFailure(launched, popups, page, tabId)).toBe(TEXT.timeout);
    await expectAppWorks(page);
  });
});

/**
 * Owner decision D1: an old or unknown protocol is not driven. Nothing is called on the page's
 * entries or on the 0.7 loader slot, `window.__COMVI__` is the same array with the same
 * entries, no script and no global are added, nothing is thrown into page code, and the popup
 * says what to do instead of offering Enable.
 */
for (const [shape, title, remedy] of [
  ["old", TEXT.oldTitle("0.7.1"), TEXT.oldRemedy],
  // The registry and the 0.7 hook are refused on their shape alone: no entry is read for a
  // version.
  ["registry", "Comvi i18n found, but it is older than 0.8.", TEXT.oldRemedy],
  ["hook", "Comvi i18n found, but it is older than 0.8.", TEXT.oldRemedy],
  ["p3", TEXT.newerTitle, TEXT.newerRemedy],
  ["kind", TEXT.newerTitle, TEXT.newerRemedy],
] as const) {
  test(`an incompatible page (${shape}) is told what to do, and nothing is done to it`, async () => {
    await withGateE({}, async (launched, popups) => {
      const { page, tabId } = await openSite(launched, `/incompatible?shape=${shape}`);
      const errors: string[] = [];
      page.on("pageerror", (error) => errors.push(error.message));

      await test.step("the popup names the reason and offers no Enable", async () => {
        const popup = await popupFor(launched, popups);
        await expectPopupView(popup, launched.worker, page, "not-detected", tabId);
        await expect(popup.locator("#reason-title")).toHaveText(title);
        await expect(popup.locator("#reason-remedy")).toHaveText(remedy);
        await expect(popup.locator("#enable-btn")).toBeHidden();
        await popup.close();
        await page.bringToFront();
      });

      await test.step("an activation command is refused as data on the channel", async () => {
        const result = await page.evaluate(
          () =>
            new Promise((resolveResult) => {
              addEventListener("comvi-extension:activated", (event) =>
                resolveResult((event as CustomEvent).detail),
              );
              dispatchEvent(new CustomEvent("comvi-extension:activate", { detail: "{}" }));
            }),
        );
        expect(result).toEqual({
          success: false,
          code: shape === "p3" || shape === "kind" ? "unknown-protocol" : "old-protocol",
        });
      });

      await test.step("proof: the same array, the same entries, no call, no script, no global", async () => {
        const proof = await page.evaluate(() => {
          const scope = globalThis as any;
          const boot = scope.__BOOT__;
          const queue = scope.__COMVI__;
          const added = Object.getOwnPropertyNames(window).filter(
            // Playwright's tracing adds its own snapshot streamer; it is not the extension's.
            (name) =>
              !boot.globals.includes(name) &&
              name !== "__BOOT__" &&
              !name.startsWith("__playwright"),
          );
          return {
            sameGlobal: queue === boot.queue,
            sameEntries:
              !Array.isArray(queue) ||
              (queue.length === boot.entries.length &&
                queue.every((entry: unknown, k: number) => entry === boot.entries[k])),
            ownMembers: Array.isArray(queue)
              ? Object.getOwnPropertyNames(queue).filter((name) => !/^\d+$|^length$/.test(name))
              : null,
            calls: scope.__CALLS__,
            scripts: [...document.scripts].map((script) => script.src),
            bootScripts: boot.scripts,
            added,
          };
        });
        expect(proof.sameGlobal).toBe(true);
        expect(proof.sameEntries).toBe(true);
        expect(proof.calls).toEqual([]);
        expect(proof.scripts).toEqual(proof.bootScripts);
        expect(proof.added).toEqual([]);
        if (shape === "hook") {
          expect(proof.ownMembers).toEqual(["__comviEditorHook", "instances", "push", "get"]);
        } else if (proof.ownMembers) {
          expect(proof.ownMembers).toEqual([]);
        }
        expect(launched.cdn.requests).toEqual([]);
        expect(await storedSession(launched.worker, tabId)).toBeUndefined();
        expect(errors).toEqual([]);
      });

      await test.step("the app keeps working", async () => {
        await page.locator("#counter").click();
        await expect(page.locator("#counter")).toHaveAttribute("data-count", "1");
        expect(await visibleText(page, "#A-title")).toBe("An app on another protocol");
      });
    });
  });
}

test("a site without devtools() is told what to add", async () => {
  await withGateE({}, async (launched: Launched, popups) => {
    const { page, tabId } = await openSite(launched, "/no-devtools", false);
    const popup = await popupFor(launched, popups);
    await expectPopupView(popup, launched.worker, page, "not-detected", tabId);
    await expect(popup.locator("#reason-title")).toHaveText(
      "Comvi i18n not detected on this page.",
    );
    await expect(popup.locator("#reason-remedy")).toContainText(
      "add plugins: [devtools()] to its i18n instance (@comvi/core 0.8 or newer)",
    );
    await expect(popup.locator("#enable-btn")).toBeHidden();
    await popup.close();
  });
});
