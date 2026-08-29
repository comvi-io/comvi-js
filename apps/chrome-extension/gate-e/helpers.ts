import {
  expect,
  chromium,
  type Browser,
  type BrowserContext,
  type Page,
  type Worker,
} from "@playwright/test";
import { createServer } from "node:net";

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
  view: "idle" | "active",
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
