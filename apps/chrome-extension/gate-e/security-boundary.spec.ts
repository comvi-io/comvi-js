import {
  expect,
  test,
  chromium,
  type Browser,
  type BrowserContext,
  type Page,
  type Worker,
} from "@playwright/test";
import { mkdtemp } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const extensionPath = resolve(import.meta.dirname, "../dist-gate-e");

async function reservePort(): Promise<number> {
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

async function extensionWorker(context: BrowserContext): Promise<Worker> {
  return (
    context.serviceWorkers()[0] ??
    (await context.waitForEvent("serviceworker", { timeout: 15_000 }))
  );
}

async function openPopup(
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

async function activateEditor(
  popup: Page,
  hostilePage: Page,
  worker: Worker,
  tabId: number,
  apiKey = "gate-e-key",
) {
  await expect(popup.locator("#state-idle")).toBeVisible({ timeout: 10_000 });
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
              .get(`comvi_session_${id}`)
              .then((state) => state[`comvi_session_${id}`]?.status);
          }, tabId),
        { timeout: 10_000 },
      )
      .toBe("active");
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

async function phaseFailures(page: Page, phase: string) {
  return page.evaluate((wantedPhase) => {
    const results =
      (
        globalThis as typeof globalThis & {
          __GATE_E_RESULTS__?: Array<{
            phase: string;
            name: string;
            pass: boolean;
            detail?: string;
          }>;
        }
      ).__GATE_E_RESULTS__ ?? [];
    return results.filter((result) => result.phase === wantedPhase && !result.pass);
  }, phase);
}

async function expectPhase(page: Page, phase: string, minimumResults: number) {
  await expect
    .poll(
      async () => {
        const results = await page.evaluate((wantedPhase) => {
          const all = (globalThis as any).__GATE_E_RESULTS__ ?? [];
          return all.filter((result: { phase: string }) => result.phase === wantedPhase);
        }, phase);
        return results.length >= minimumResults;
      },
      { timeout: 20_000 },
    )
    .toBe(true);
  expect(await phaseFailures(page, phase)).toEqual([]);
}

test("built MV3 extension enforces the hostile-page trust boundary", async () => {
  test.setTimeout(100_000);
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
  });
  const cdpConnections: Browser[] = [];

  try {
    const worker = await extensionWorker(context);
    const extensionId = new URL(worker.url()).host;
    const page = await context.newPage();
    await page.goto("http://127.0.0.1:8791/");
    await page.bringToFront();
    const tabId = await worker.evaluate(() => {
      const chromeApi = (globalThis as typeof globalThis & { chrome: typeof chrome }).chrome;
      return chromeApi.tabs
        .query({ active: true, currentWindow: true })
        .then((tabs) => tabs[0]?.id);
    });
    if (typeof tabId !== "number") throw new Error("Hostile page tab was not active");
    await page.evaluate(() => {
      (globalThis as any).__GATE_E_ACTIVATIONS__ = [];
      addEventListener("comvi-extension:activated", (event) => {
        (globalThis as any).__GATE_E_ACTIVATIONS__.push((event as CustomEvent).detail);
      });
    });

    // Opening the real action popup performs the production on-demand content
    // injection. Close it before probing so Phase 1 still has no session.
    const setupPopup = await openPopup(worker, extensionId, debuggingPort, cdpConnections);
    await expect(setupPopup.locator("#state-idle")).toBeVisible({ timeout: 10_000 });
    await setupPopup.close();
    await page.bringToFront();

    await page.evaluate(() => (globalThis as any).gateE.runPhase1());
    await expectPhase(page, "1", 4);

    const popup = await openPopup(worker, extensionId, debuggingPort, cdpConnections);
    await activateEditor(popup, page, worker, tabId);
    await popup.close();
    await page.bringToFront();
    await page.evaluate(() => (globalThis as any).gateE.runPhase2());
    await expectPhase(page, "2", 13);

    await page.bringToFront();
    const forgetPopup = await openPopup(worker, extensionId, debuggingPort, cdpConnections);
    await expect(forgetPopup.locator("#state-idle")).toBeVisible({ timeout: 10_000 });
    await forgetPopup.locator("#forget-key-btn").click();
    await page.evaluate(() => (globalThis as any).gateE.runPhase3());
    await expectPhase(page, "3", 1);
    await forgetPopup.close();
    await page.bringToFront();

    await page.evaluate(() => {
      void (globalThis as any).gateE.runPhase5();
    });
    const racePopup = await openPopup(worker, extensionId, debuggingPort, cdpConnections);
    await expect(racePopup.locator("#state-idle")).toBeVisible({ timeout: 10_000 });
    await racePopup.locator("#api-key").fill("gate-e-key");
    await racePopup.locator("#enable-btn").click();
    await racePopup.close();
    await expectPhase(page, "5", 2);

    await page.evaluate(() => {
      void (globalThis as any).gateE.runPhase4();
    });
    const navigationPopup = await openPopup(worker, extensionId, debuggingPort, cdpConnections);
    await expect(navigationPopup.locator("#state-idle")).toBeVisible({ timeout: 10_000 });
    await navigationPopup.locator("#api-key").fill("gate-e-key");
    await navigationPopup.locator("#enable-btn").click();
    await page.waitForURL("**/?navigation-race=check", { timeout: 10_000 });
    await expectPhase(page, "4", 1);
    if (!navigationPopup.isClosed()) await navigationPopup.close();

    // The two-tab credential-family case is deterministic at the service-
    // worker integration level. Programmatic openPopup() cannot grant
    // activeTab to a newly-created second tab, unlike a real toolbar click.
    // See service-worker.test.ts: "revokes sessions on other origins that use
    // the same API key".
  } finally {
    await context.close();
  }
});
