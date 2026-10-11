import { expect, test, chromium, type Browser, type Page, type Worker } from "@playwright/test";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import {
  activateEditor,
  expectPopupView,
  extensionWorker,
  openPopup,
  reservePort,
  storedSession,
  serveEditorFromLocalBuild,
} from "./helpers";
import type { SessionStore, TabStateStore } from "./helpers";

const extensionPath = resolve(import.meta.dirname, "../dist-gate-e");
const POLL = { timeout: 10_000 };

/** Whether the mock API is holding a key validation, and how many it delivered. */
function heldValidation(page: Page): Promise<{ held: boolean; delivered: number }> {
  return page.evaluate(() => (globalThis as any).gateE.heldValidation());
}

/**
 * Settled START_SESSION outcomes, in order. Recorded by the worker in Gate E
 * builds only (service-worker.ts recordStartSessionOutcome), so a spec can
 * wait for the terminal result of an attempt whose popup is already closed.
 */
function startSessionOutcomes(worker: Worker): Promise<Array<{ ok: boolean; error?: string }>> {
  return worker.evaluate(
    () =>
      (
        globalThis as typeof globalThis & {
          __gateEStartSessionOutcomes?: Array<{ ok: boolean; error?: string }>;
        }
      ).__gateEStartSessionOutcomes ?? [],
  );
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

async function phaseResultNames(page: Page, phase: string): Promise<string[]> {
  return page.evaluate((wantedPhase) => {
    const all = ((globalThis as any).__GATE_E_RESULTS__ ?? []) as Array<{
      phase: string;
      name: string;
    }>;
    return all.filter((result) => result.phase === wantedPhase).map((result) => result.name);
  }, phase);
}

async function expectPhase(page: Page, phase: string, minimumResults: number) {
  await expect
    .poll(async () => (await phaseResultNames(page, phase)).length, {
      timeout: 20_000,
      message: `phase ${phase} should record at least ${minimumResults} checks`,
    })
    .toBeGreaterThanOrEqual(minimumResults);

  const names = await phaseResultNames(page, phase);
  expect(await phaseFailures(page, phase), `phase ${phase} recorded: ${names.join(" | ")}`).toEqual(
    [],
  );
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
    await serveEditorFromLocalBuild(context);
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

    await test.step("phase 1: an unauthenticated hostile page has no capability", async () => {
      // Manifest content scripts must detect Comvi and update tab state before
      // the user opens the popup. This is the automatic toolbar-icon contract.
      await expect
        .poll(
          () =>
            worker.evaluate((id) => {
              const chromeApi = (globalThis as typeof globalThis & { chrome: typeof chrome })
                .chrome;
              return chromeApi.storage.session
                .get<TabStateStore>(`comvi_tabstate_${id}`)
                .then((state) => state[`comvi_tabstate_${id}`]?.comviDetected === true);
            }, tabId),
          { timeout: 10_000 },
        )
        .toBe(true);

      await page.evaluate(() => {
        (globalThis as any).__GATE_E_ACTIVATIONS__ = [];
        addEventListener("comvi-extension:activated", (event) => {
          (globalThis as any).__GATE_E_ACTIVATIONS__.push((event as CustomEvent).detail);
        });
      });

      // Opening the real action popup rechecks the already-detected page. Close
      // it before probing so Phase 1 still has no authenticated session.
      const setupPopup = await openPopup(worker, extensionId, debuggingPort, cdpConnections);
      await expectPopupView(setupPopup, worker, page, "idle", tabId);
      await setupPopup.close();
      await page.bringToFront();

      await page.evaluate(() => (globalThis as any).gateE.runPhase1());
      await expectPhase(page, "1", 4);
    });

    await test.step("phase 2: an authenticated session exposes only the contract routes", async () => {
      const popup = await openPopup(worker, extensionId, debuggingPort, cdpConnections);
      await activateEditor(popup, page, worker, tabId);
      // Regression: the runtime starts its refresh during activate(). The
      // worker must hold that request until the pending session is promoted;
      // otherwise it is denied locally and never reaches the API.
      await expect
        .poll(
          () =>
            page.evaluate(() =>
              fetch("/__log")
                .then((response) => response.json())
                .then((log) =>
                  log.requests.some((request: { path?: string }) =>
                    request.path?.startsWith("/v1/translations?"),
                  ),
                ),
            ),
          { timeout: 10_000 },
        )
        .toBe(true);

      // Vue Router / React Router style same-document navigation must retain
      // the active editor authority and its bound proxy transport. The URL
      // changes, but the top-level documentId does not.
      await popup.close();
      await page.bringToFront();
      await page.evaluate(() => history.pushState({}, "", "/spa-route"));
      await page.waitForURL("**/spa-route");
      await expect
        .poll(
          () =>
            worker.evaluate((id) => {
              const chromeApi = (globalThis as typeof globalThis & { chrome: typeof chrome })
                .chrome;
              return chromeApi.storage.session
                .get<SessionStore>(`comvi_session_${id}`)
                .then((state) => state[`comvi_session_${id}`]?.status);
            }, tabId),
          POLL,
        )
        .toBe("active");

      const spaPopup = await openPopup(worker, extensionId, debuggingPort, cdpConnections);
      await expect(spaPopup.locator("#state-active")).toBeVisible({ timeout: 10_000 });
      await spaPopup.close();
      await page.bringToFront();
      await page.evaluate(() => (globalThis as any).gateE.runPhase2());
      // Direct SDK teardown: wait for the worker to drop the session, then probe.
      await page.evaluate(() => (globalThis as any).ComviInContextEditor.deactivate());
      await expect.poll(() => storedSession(worker, tabId), POLL).toBeUndefined();
      await page.evaluate(() => (globalThis as any).gateE.checkSdkDeactivation());
      await expectPhase(page, "2", 13);
    });

    await test.step("phase 3: disabling and forgetting the key revokes the capability", async () => {
      await page.bringToFront();
      const forgetPopup = await openPopup(worker, extensionId, debuggingPort, cdpConnections);
      await activateEditor(forgetPopup, page, worker, tabId);
      await forgetPopup.locator("#disable-btn").click();
      await expectPopupView(forgetPopup, worker, page, "idle", tabId);
      await expect
        .poll(
          () =>
            worker.evaluate((id) => {
              const chromeApi = (globalThis as typeof globalThis & { chrome: typeof chrome })
                .chrome;
              return chromeApi.storage.session
                .get<SessionStore>(`comvi_session_${id}`)
                .then((state) => state[`comvi_session_${id}`]);
            }, tabId),
          POLL,
        )
        .toBeUndefined();
      await forgetPopup.locator("#forget-key-btn").click();
      await expect(forgetPopup.locator("#forget-key-btn")).toBeHidden({ timeout: 10_000 });
      await page.evaluate(() => (globalThis as any).gateE.runPhase3());
      await expectPhase(page, "3", 1);
      await forgetPopup.close();
      await page.bringToFront();
    });

    await test.step("phase 5: a popup closed mid-activation leaves no usable capability", async () => {
      await page.evaluate(() => (globalThis as any).gateE.runPhase5());
      const attemptsBefore = (await startSessionOutcomes(worker)).length;
      const racePopup = await openPopup(worker, extensionId, debuggingPort, cdpConnections);
      await expectPopupView(racePopup, worker, page, "idle", tabId);
      await racePopup.locator("#api-key").fill("gate-e-key");
      await racePopup.locator("#enable-btn").click();
      await expect.poll(() => heldValidation(page), POLL).toMatchObject({ held: true });
      await racePopup.close();
      await page.bringToFront();
      await page.evaluate(() => (globalThis as any).gateE.releaseValidation());

      // Wait for this attempt's terminal outcome, not only for its network
      // response: identity checks, locks and the lease check run after it.
      await expect
        .poll(async () => (await startSessionOutcomes(worker)).length, POLL)
        .toBe(attemptsBefore + 1);
      const outcome = (await startSessionOutcomes(worker))[attemptsBefore];
      expect(outcome).toMatchObject({ ok: false });
      expect(await storedSession(worker, tabId)).toBeUndefined();
      await page.evaluate(() => (globalThis as any).gateE.checkPhase5());
      await expectPhase(page, "5", 2);
    });

    await test.step("phase 4: a navigation racing activation cannot inherit the old document's validation", async () => {
      await page.evaluate(() => (globalThis as any).gateE.runPhase4());
      const navigationPopup = await openPopup(worker, extensionId, debuggingPort, cdpConnections);
      await expectPopupView(navigationPopup, worker, page, "idle", tabId);
      await navigationPopup.locator("#api-key").fill("gate-e-key");
      await navigationPopup.locator("#enable-btn").click();
      // Validation is parked in the mock, so the reload lands mid-validation.
      await expect.poll(() => heldValidation(page), POLL).toMatchObject({ held: true });
      // The URL is still phase 2's pushState route, which the mock does not serve.
      await page.goto("http://127.0.0.1:8791/?navigation-race=check");
      await page.evaluate(() => (globalThis as any).gateE.releaseValidation());
      await expect(navigationPopup.locator("#error-msg")).toContainText("navigated", {
        timeout: 10_000,
      });
      await page.evaluate(() => (globalThis as any).gateE.checkPhase4());
      await expectPhase(page, "4", 1);
      if (!navigationPopup.isClosed()) await navigationPopup.close();
    });

    // The two-tab credential-family case is deterministic at the service-
    // worker integration level. Programmatic openPopup() cannot grant
    // activeTab to a newly-created second tab, unlike a real toolbar click.
    // See service-worker.credentials.test.ts: "revokes sessions on other origins that use
    // the same API key".
  } finally {
    await context.close();
  }
});
