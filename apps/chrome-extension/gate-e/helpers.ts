import {
  expect,
  chromium,
  type Browser,
  type BrowserContext,
  type Page,
  type Worker,
} from "@playwright/test";
import { existsSync } from "node:fs";
import { mkdtemp } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import type { SessionRecord, TabState } from "../src/background/state";
import type { OriginCredentials } from "../src/shared/storage";

/**
 * `chrome.storage.session.get(key)` cannot infer a record shape from a
 * computed key, so it falls back to an empty type and every read off the
 * result is a type error. The specs state the shape they expect with these.
 */
export type SessionStore = Record<string, SessionRecord | undefined>;
export type TabStateStore = Record<string, TabState | undefined>;
export type CredentialStore = { comvi_credentials?: Record<string, OriginCredentials> };

/** Fail at collection time, so a missing variable fails the file rather than one test. */
export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required for the real-platform system test`);
  return value;
}

/**
 * Reserve a CDP port by binding :0 and releasing it. Between the release and
 * Chromium's bind the port is technically free — `workers: 1` and
 * `fullyParallel: false` keep the window closed for our own runs.
 */
export async function reservePort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolveListen, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolveListen);
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Could not reserve a CDP port");
  await new Promise<void>((resolveClose, reject) =>
    server.close((error) => (error ? reject(error) : resolveClose())),
  );
  return address.port;
}

export async function extensionWorker(context: BrowserContext): Promise<Worker> {
  return (
    context.serviceWorkers()[0] ??
    (await context.waitForEvent("serviceworker", { timeout: 15_000 }))
  );
}

export async function openPopup(
  worker: Worker,
  extensionId: string,
  debuggingPort: number,
  connections: Browser[],
): Promise<Page> {
  await worker.evaluate(() => {
    const chromeApi = (globalThis as typeof globalThis & { chrome: typeof chrome }).chrome;
    return chromeApi.action.openPopup();
  });

  const connection = await chromium.connectOverCDP(`http://127.0.0.1:${debuggingPort}`);
  connections.push(connection);
  const popupUrl = `chrome-extension://${extensionId}/popup.html`;
  const popup = connection
    .contexts()
    .flatMap((context) => context.pages())
    .find((page) => page.url() === popupUrl);
  if (!popup) throw new Error(`Toolbar popup target was not exposed at ${popupUrl}`);
  return popup;
}

/**
 * `expect(#state-<view>).toBeVisible()` with a failure message that names the view the
 * popup actually settled in, its error line, the service worker's session storage and the
 * page's content-script markers — a bare "hidden" says nothing about which side stalled.
 */
export async function expectPopupView(
  popup: Page,
  worker: Worker,
  page: Page,
  view: "idle" | "active" | "not-detected",
  tabId?: number,
  timeout = 10_000,
): Promise<void> {
  try {
    await expect(popup.locator(`#state-${view}`)).toBeVisible({ timeout });
  } catch (error) {
    const diagnostics = {
      visibleViews: await popup
        .locator(".comvi-view:not(.hidden)")
        .evaluateAll((els) => els.map((el) => el.id)),
      error: await popup
        .locator("#error-msg")
        .textContent()
        .catch(() => null),
      popupUrl: popup.url(),
      popupTabs: await popup
        .evaluate(async (expectedTabId) => {
          const chromeApi = (globalThis as typeof globalThis & { chrome: typeof chrome }).chrome;
          const current = await chromeApi.windows.getCurrent();
          const active = await chromeApi.tabs.query({ active: true, currentWindow: true });
          const probe =
            typeof expectedTabId === "number"
              ? await new Promise((resolve) =>
                  chromeApi.tabs.sendMessage(expectedTabId, { type: "GET_STATUS" }, (response) =>
                    resolve(chromeApi.runtime.lastError?.message ?? response),
                  ),
                )
              : "no expected tab";
          return { window: current.id, active: active.map((t) => [t.id, t.url]), probe };
        }, tabId)
        .catch((e: unknown) => String(e)),
      workerTabs: await worker.evaluate(() => {
        const chromeApi = (globalThis as typeof globalThis & { chrome: typeof chrome }).chrome;
        return chromeApi.tabs
          .query({})
          .then((tabs) => tabs.map((t) => [t.id, t.windowId, t.active, t.url]));
      }),
      storage: await worker.evaluate(() => {
        const chromeApi = (globalThis as typeof globalThis & { chrome: typeof chrome }).chrome;
        return chromeApi.storage.session.get(null);
      }),
      page: await page
        .evaluate(() => ({
          readyState: document.readyState,
          url: location.href,
          comviGlobal: typeof (globalThis as any).__COMVI__,
          bridge: Boolean((globalThis as any).__comviExtensionBridge),
        }))
        .catch((e: unknown) => String(e)),
    };
    throw new Error(`popup never reached #state-${view}: ${JSON.stringify(diagnostics)}`, {
      cause: error,
    });
  }
}

/** Enable the editor from an open popup and wait until the worker holds an active session. */
export async function activateEditor(
  popup: Page,
  hostilePage: Page,
  worker: Worker,
  tabId: number,
  apiKey = "gate-e-key",
) {
  await expectPopupView(popup, worker, hostilePage, "idle", tabId);
  const key = popup.locator("#api-key");
  if (!(await key.inputValue())) await key.fill(apiKey);
  await popup.locator("#enable-btn").click();
  try {
    await expect
      .poll(
        () =>
          worker.evaluate((id) => {
            const chromeApi = (globalThis as typeof globalThis & { chrome: typeof chrome }).chrome;
            return chromeApi.storage.session
              .get<SessionStore>(`comvi_session_${id}`)
              .then((state) => state[`comvi_session_${id}`]?.status);
          }, tabId),
        { timeout: 10_000 },
      )
      .toBe("active");
    await expect(popup.locator("#state-active")).toBeVisible({ timeout: 5_000 });
    await expect(popup.locator("#state-active")).toContainText("Editor active on this page");
  } catch (error) {
    const diagnostics = {
      error: await popup.locator("#error-msg").textContent(),
      button: await popup.locator("#enable-btn").textContent(),
      page: await hostilePage.evaluate(() => ({
        editorLoaded: Boolean((globalThis as any).ComviInContextEditor),
        editorActive: (globalThis as any).ComviInContextEditor?.isActive?.(),
        activations: (globalThis as any).__GATE_E_ACTIVATIONS__ ?? [],
      })),
      storage: await worker.evaluate(() => {
        const chromeApi = (globalThis as typeof globalThis & { chrome: typeof chrome }).chrome;
        return chromeApi.storage.session.get(null);
      }),
    };
    throw new Error(`Editor activation timed out: ${JSON.stringify(diagnostics)}`, {
      cause: error,
    });
  }
}

const EDITOR_BUILD = resolve(
  import.meta.dirname,
  "../../../packages/plugin-in-context-editor/dist/standalone.iife.js",
);

/**
 * The URL the page's `devtools()` hook loads the editor from: any version, and
 * the `?comvi=<hour>` cache salt it appends on `latest`.
 */
const EDITOR_CDN_URL =
  /^https:\/\/cdn\.jsdelivr\.net\/npm\/@comvi\/plugin-in-context-editor@[^/]+\/dist\/standalone\.iife\.js(\?.*)?$/;

/**
 * Stand in for jsDelivr: the extension carries no editor, the page's own
 * Comvi SDK loads it from the CDN. Every request for it is answered with the
 * locally built editor (or refused, for the unreachable-CDN case), so the gate
 * tests the editor of this commit and never touches the network. Nothing in
 * the extension or the SDK knows about this. Returns the URLs requested.
 */
export async function serveEditorFromLocalBuild(
  context: BrowserContext,
  cdn: "local-build" | "unreachable" = "local-build",
): Promise<string[]> {
  if (!existsSync(EDITOR_BUILD)) {
    throw new Error(
      `No editor build at ${EDITOR_BUILD}. Run: pnpm exec turbo run build --filter @comvi/plugin-in-context-editor`,
    );
  }
  const requested: string[] = [];
  // Anything else on the CDN host is a request the harness does not expect.
  await context.route("https://cdn.jsdelivr.net/**", (route) => {
    const url = route.request().url();
    requested.push(url);
    if (cdn === "unreachable" || !EDITOR_CDN_URL.test(url)) return route.abort("failed");
    return route.fulfill({
      path: EDITOR_BUILD,
      contentType: "application/javascript; charset=utf-8",
      headers: { "access-control-allow-origin": "*" },
    });
  });
  return requested;
}

/** Launch Chromium with the unpacked Gate E build and return its worker and extension id. */
export async function launchGateE(
  options: { backForwardCache?: boolean; cdn?: "local-build" | "unreachable" } = {},
): Promise<{
  context: BrowserContext;
  worker: Worker;
  extensionId: string;
  debuggingPort: number;
  /** Every URL the page requested from the editor CDN. */
  cdnRequests: string[];
}> {
  const extensionPath = resolve(import.meta.dirname, "../dist-gate-e");
  const userDataDir = await mkdtemp(join(tmpdir(), "comvi-gate-e-"));
  const debuggingPort = await reservePort();
  const context = await chromium.launchPersistentContext(userDataDir, {
    channel: "chromium",
    headless: true,
    args: [
      `--remote-debugging-port=${debuggingPort}`,
      `--disable-extensions-except=${extensionPath}`,
      `--load-extension=${extensionPath}`,
    ],
    // Playwright disables the back/forward cache by default; real Chrome
    // restores cached documents, which is the case under test.
    ...(options.backForwardCache ? { ignoreDefaultArgs: ["--disable-back-forward-cache"] } : {}),
  });
  const cdnRequests = await serveEditorFromLocalBuild(context, options.cdn);
  const worker = await extensionWorker(context);
  return {
    context,
    worker,
    extensionId: new URL(worker.url()).host,
    debuggingPort,
    cdnRequests,
  };
}

/** The active tab id as the extension sees it. */
export async function activeTabId(worker: Worker): Promise<number> {
  const tabId = await worker.evaluate(() => {
    const chromeApi = (globalThis as typeof globalThis & { chrome: typeof chrome }).chrome;
    return chromeApi.tabs.query({ active: true, currentWindow: true }).then((tabs) => tabs[0]?.id);
  });
  if (typeof tabId !== "number") throw new Error("No active tab");
  return tabId;
}

/** The worker's stored session record for a tab, if any. */
export function storedSession(worker: Worker, tabId: number) {
  return worker.evaluate((id) => {
    const chromeApi = (globalThis as typeof globalThis & { chrome: typeof chrome }).chrome;
    return chromeApi.storage.session
      .get<SessionStore>(`comvi_session_${id}`)
      .then((state) => state[`comvi_session_${id}`]);
  }, tabId);
}

/** Wait until the manifest content scripts reported Comvi on the tab. */
export async function waitForDetection(worker: Worker, tabId: number): Promise<void> {
  await expect
    .poll(
      () =>
        worker.evaluate((id) => {
          const chromeApi = (globalThis as typeof globalThis & { chrome: typeof chrome }).chrome;
          return chromeApi.storage.session
            .get<TabStateStore>(`comvi_tabstate_${id}`)
            .then((state) => state[`comvi_tabstate_${id}`]?.comviDetected === true);
        }, tabId),
      { timeout: 10_000 },
    )
    .toBe(true);
}
