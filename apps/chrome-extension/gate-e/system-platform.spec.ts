import {
  expect,
  test,
  chromium,
  type Browser,
  type BrowserContext,
  type Page,
  type Worker,
} from "@playwright/test";
import { readFileSync } from "node:fs";
import { mkdtemp } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const extensionPath = resolve(import.meta.dirname, "../dist-system");
const apiBaseUrl = process.env.VITE_COMVI_API_BASE_URL;
if (!apiBaseUrl) {
  throw new Error("VITE_COMVI_API_BASE_URL is required for the real-platform system test");
}
const apiOrigin = new URL(apiBaseUrl).origin;
const manifest = JSON.parse(
  readFileSync(resolve(extensionPath, "manifest.json"), "utf8"),
) as chrome.runtime.ManifestV3;
const wireObservation = JSON.parse(
  readFileSync(
    resolve(import.meta.dirname, "../src/shared/__fixtures__/wire-observation.fixture.json"),
    "utf8",
  ),
) as {
  items: Array<{ namespace: string; key: string } & Record<string, unknown>>;
};
const apiKey = process.env.COMVI_SYSTEM_API_KEY;
if (!apiKey) throw new Error("COMVI_SYSTEM_API_KEY is required for the real-platform system test");
const fetchLoaderBundlePath = process.env.COMVI_FETCH_LOADER_BUNDLE_PATH;
if (!fetchLoaderBundlePath) {
  throw new Error("COMVI_FETCH_LOADER_BUNDLE_PATH is required for the real-platform system test");
}
const fetchLoaderSource = readFileSync(fetchLoaderBundlePath, "utf8");
const systemCdnUrl = process.env.COMVI_SYSTEM_CDN_URL;
if (!systemCdnUrl) {
  throw new Error("COMVI_SYSTEM_CDN_URL is required for the real-platform system test");
}
const systemCdnExpectedValue = process.env.COMVI_SYSTEM_CDN_EXPECTED_VALUE;
if (!systemCdnExpectedValue) {
  throw new Error("COMVI_SYSTEM_CDN_EXPECTED_VALUE is required for the real-platform system test");
}

type ProxyResult = {
  denied: boolean;
  status?: number;
  networkError?: string;
  body?: string;
};

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

async function expectIdle(popup: Page, hostilePage: Page): Promise<void> {
  try {
    await expect(popup.locator("#state-idle")).toBeVisible({ timeout: 10_000 });
  } catch (error) {
    const diagnostics = {
      popupTabs: await popup.evaluate(() => chrome.tabs.query({ currentWindow: true })),
      popupState: await popup.evaluate(() =>
        ["state-not-detected", "state-idle", "state-active"].map((id) => ({
          id,
          className: document.getElementById(id)?.className,
        })),
      ),
      page: await hostilePage.evaluate(() => ({
        detectorInstalled: Boolean((globalThis as any).__comviExtensionDetectorInstalled),
        bridgeInstalled: Boolean((globalThis as any).__comviExtensionBridgeInstalled),
        comviDetected: Boolean((globalThis as any).__COMVI__),
      })),
    };
    throw new Error(`Popup did not reach idle state: ${JSON.stringify(diagnostics)}`, {
      cause: error,
    });
  }
}

async function activate(
  popup: Page,
  worker: Worker,
  tabId: number,
  collectContext: boolean,
): Promise<void> {
  await expect(popup.locator("#state-idle")).toBeVisible({ timeout: 10_000 });
  await popup.locator("#api-key").fill(apiKey);
  if (collectContext) await popup.locator("#collect-context").check();
  await popup.locator("#enable-btn").click();
  await expect
    .poll(
      () =>
        worker.evaluate((id) => {
          const chromeApi = (globalThis as typeof globalThis & { chrome: typeof chrome }).chrome;
          return chromeApi.storage.session
            .get(`comvi_session_${id}`)
            .then((state) => state[`comvi_session_${id}`]?.status);
        }, tabId),
      { timeout: 15_000 },
    )
    .toBe("active");
}

async function deactivate(page: Page, worker: Worker, tabId: number): Promise<void> {
  await page.evaluate(() => (globalThis as any).ComviInContextEditor.deactivate());
  await expect
    .poll(() =>
      worker.evaluate((id) => {
        const chromeApi = (globalThis as typeof globalThis & { chrome: typeof chrome }).chrome;
        return chromeApi.storage.session
          .get(`comvi_session_${id}`)
          .then((state) => state[`comvi_session_${id}`]);
      }, tabId),
    )
    .toBeUndefined();
}

async function proxy(page: Page, path: string, options: { method?: string; body?: string } = {}) {
  return page.evaluate(
    ({ requestPath, requestOptions }) =>
      (globalThis as any).gateE.proxy(requestPath, requestOptions),
    { requestPath: path, requestOptions: options },
  ) as Promise<ProxyResult>;
}

function parseBody(result: ProxyResult): any {
  expect(result.denied, result.networkError).toBe(false);
  expect(typeof result.body).toBe("string");
  return JSON.parse(result.body!);
}

test("real platform persists editor writes and opted-in context through the MV3 boundary", async () => {
  expect(manifest.content_scripts).toBeUndefined();
  expect(manifest.host_permissions?.toSorted()).toEqual(
    [`${apiOrigin}/*`, "http://127.0.0.1:8791/*"].toSorted(),
  );
  expect(manifest.host_permissions).not.toContain("<all_urls>");

  const userDataDir = await mkdtemp(join(tmpdir(), "comvi-system-platform-"));
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
  const connections: Browser[] = [];

  try {
    const worker = await extensionWorker(context);
    const extensionId = new URL(worker.url()).host;
    const startupPages = context.pages();
    const page = await context.newPage();
    await Promise.all(startupPages.map((startupPage) => startupPage.close()));
    await page.goto("http://127.0.0.1:8791/");
    await page.bringToFront();
    const tabId = await worker.evaluate(() => {
      const chromeApi = (globalThis as typeof globalThis & { chrome: typeof chrome }).chrome;
      return chromeApi.tabs
        .query({ active: true, currentWindow: true })
        .then((tabs) => tabs[0]?.id);
    });
    if (typeof tabId !== "number") throw new Error("System page tab was not active");

    const setupPopup = await openPopup(worker, extensionId, debuggingPort, connections);
    await expectIdle(setupPopup, page);
    await setupPopup.close();
    await page.bringToFront();

    const popup = await openPopup(worker, extensionId, debuggingPort, connections);
    await activate(popup, worker, tabId, false);
    await popup.close();
    await page.bringToFront();

    const project = parseBody(await proxy(page, "/v1/project"));
    expect(project.id).toBe(1);
    expect(parseBody(await proxy(page, "/v1/project/locales")).locales.length).toBeGreaterThan(0);
    expect(parseBody(await proxy(page, "/v1/translations"))).toBeTruthy();

    const save = await proxy(page, "/v1/keys", {
      method: "PUT",
      body: JSON.stringify({
        key: "system.crud",
        namespace: "common",
        isPlural: false,
        translations: { en: { value: "System value", status: "translated" } },
      }),
    });
    expect([200, 201]).toContain(save.status);
    const saved = parseBody(await proxy(page, "/v1/keys/common/system.crud"));
    expect(saved.translations.en.value).toBe("System value");

    const telemetryOff = await proxy(page, "/v1/context/handshake", {
      method: "POST",
      body: JSON.stringify({ keys: [] }),
    });
    expect(telemetryOff.denied).toBe(true);

    await deactivate(page, worker, tabId);

    const telemetryPopup = await openPopup(worker, extensionId, debuggingPort, connections);
    await activate(telemetryPopup, worker, tabId, true);
    await telemetryPopup.close();
    await page.bringToFront();

    for (const item of wireObservation.items) {
      const result = await proxy(page, "/v1/keys", {
        method: "PUT",
        body: JSON.stringify({
          key: item.key,
          namespace: item.namespace,
          isPlural: false,
          translations: { en: { value: `System ${item.key}`, status: "translated" } },
        }),
      });
      expect([200, 201]).toContain(result.status);
    }

    const keys = wireObservation.items.map(({ namespace, key }) => ({ namespace, key }));
    const initialHandshake = parseBody(
      await proxy(page, "/v1/context/handshake", {
        method: "POST",
        body: JSON.stringify({ keys }),
      }),
    );
    expect(initialHandshake.entries).toEqual([]);

    const usages = parseBody(
      await proxy(page, "/v1/context/usages", {
        method: "POST",
        body: JSON.stringify({
          origin: "http://127.0.0.1:8791",
          hashFnVersion: 1,
          items: wireObservation.items,
          stillValid: [],
        }),
      }),
    );
    expect(usages.updated).toHaveLength(wireObservation.items.length);
    expect(usages.orphanObservations).toBe(0);

    const persisted = parseBody(
      await proxy(page, "/v1/context/handshake", {
        method: "POST",
        body: JSON.stringify({ keys }),
      }),
    );
    expect(persisted.entries).toHaveLength(wireObservation.items.length);
    expect(persisted.entries.every((entry: any) => entry.screenGroups.length > 0)).toBe(true);

    const delayConfig = await fetch(`${apiBaseUrl}/__system/config?nextTranslationsDelayMs=8000`);
    expect(delayConfig.ok).toBe(true);
    const loaderResult = await page.evaluate(async (source) => {
      const moduleUrl = URL.createObjectURL(new Blob([source], { type: "text/javascript" }));
      const loader = (await import(moduleUrl)) as {
        fetchApiTranslations: (
          apiKey: string,
          locale: string,
          namespaces: string[],
          apiBaseUrl: string,
          timeoutMs: number,
          fetchFn: typeof fetch,
          cacheScope: string,
        ) => Promise<unknown>;
      };
      URL.revokeObjectURL(moduleUrl);

      const transportFetch: typeof fetch = (input, init) =>
        new Promise<Response>((resolveResponse, rejectResponse) => {
          const target =
            typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
          const url = new URL(target);
          const id = `system-loader-${Date.now()}-${Math.random().toString(36).slice(2)}`;
          const signal = init?.signal;

          const cleanup = () => {
            removeEventListener("comvi-extension:api-response", onResponse as EventListener);
            signal?.removeEventListener("abort", onAbort);
          };
          const onAbort = () => {
            dispatchEvent(
              new CustomEvent("comvi-extension:api-abort", {
                detail: JSON.stringify({ id }),
              }),
            );
            cleanup();
            rejectResponse(new DOMException("The operation was aborted.", "AbortError"));
          };
          const onResponse = (event: CustomEvent) => {
            const detail =
              typeof event.detail === "string" ? JSON.parse(event.detail) : event.detail;
            if (detail?.id !== id) return;
            cleanup();
            if (detail.networkError || typeof detail.status !== "number") {
              rejectResponse(new TypeError(detail.networkError ?? "Proxy request failed"));
              return;
            }
            resolveResponse(
              new Response(detail.body ?? null, {
                status: detail.status,
                statusText: detail.statusText,
                headers: { "content-type": "application/json" },
              }),
            );
          };

          addEventListener("comvi-extension:api-response", onResponse as EventListener);
          signal?.addEventListener("abort", onAbort, { once: true });
          dispatchEvent(
            new CustomEvent("comvi-extension:api-request", {
              detail: JSON.stringify({
                id,
                path: url.pathname + url.search,
                method: init?.method,
              }),
            }),
          );
        });

      const startedAt = performance.now();
      try {
        await loader.fetchApiTranslations(
          "",
          "en",
          ["common"],
          "https://transport.invalid",
          5000,
          transportFetch,
          `system-loader-${Date.now()}`,
        );
        return {
          resolved: true,
          elapsedMs: performance.now() - startedAt,
          message: "",
          translationEntries: [] as Array<[string, Record<string, unknown>]>,
        };
      } catch (error) {
        const timeoutElapsedMs = performance.now() - startedAt;
        const translations = (await loader.fetchApiTranslations(
          "",
          "en",
          ["common"],
          "https://transport.invalid",
          5000,
          transportFetch,
          `system-packed-loader-${Date.now()}`,
        )) as Map<string, Record<string, unknown>>;
        return {
          resolved: false,
          elapsedMs: timeoutElapsedMs,
          message: error instanceof Error ? error.message : String(error),
          translationEntries: Array.from(translations.entries()),
        };
      }
    }, fetchLoaderSource);
    expect(loaderResult.resolved).toBe(false);
    expect(loaderResult.elapsedMs).toBeGreaterThanOrEqual(4500);
    expect(loaderResult.elapsedMs).toBeLessThan(7000);
    expect(loaderResult.message).toContain("Request timeout after 5000ms");
    expect(loaderResult.translationEntries.length).toBeGreaterThan(0);
    expect(loaderResult.translationEntries.some(([key]) => key === "en:common")).toBe(true);

    const cdnLoaderResult = await page.evaluate(
      async ({ source, cdnUrl }) => {
        const moduleUrl = URL.createObjectURL(new Blob([source], { type: "text/javascript" }));
        const packed = (await import(moduleUrl)) as {
          FetchLoader: (options: {
            cdnUrl: string;
            loadOnInit: boolean;
          }) => (i18n: Record<string, unknown>) => Promise<unknown>;
        };
        URL.revokeObjectURL(moduleUrl);

        let registeredLoader:
          | ((locale: string, namespace: string) => Promise<Record<string, unknown>>)
          | undefined;
        const i18n = {
          apiKey: undefined,
          isInitializing: false,
          locale: "en",
          setPluginData: () => undefined,
          getDefaultNamespace: () => "default",
          getActiveNamespaces: () => ["common"],
          registerLoader: (
            loader: (locale: string, namespace: string) => Promise<Record<string, unknown>>,
          ) => {
            registeredLoader = loader;
          },
          addTranslations: () => undefined,
        };
        await packed.FetchLoader({ cdnUrl, loadOnInit: false })(i18n);
        if (!registeredLoader) throw new Error("Packed FetchLoader did not register a CDN loader");
        return registeredLoader("en", "common");
      },
      { source: fetchLoaderSource, cdnUrl: systemCdnUrl },
    );
    expect(cdnLoaderResult["system.published"]).toBe(systemCdnExpectedValue);

    const requestAudit = (await (await fetch(`${apiBaseUrl}/__system/audit`)).json()) as {
      requests: Array<{ path: string; aborted: boolean }>;
    };
    expect(
      requestAudit.requests.filter(
        ({ path, aborted }) => aborted && path.startsWith("/v1/translations"),
      ),
    ).toHaveLength(1);

    const deleted = await proxy(page, "/v1/keys/common/system.crud", { method: "DELETE" });
    expect([200, 204]).toContain(deleted.status);
    const missing = await proxy(page, "/v1/keys/common/system.crud");
    expect(missing.denied).toBe(true);

    const unrelated = await proxy(page, "/v1/organizations");
    expect(unrelated.denied).toBe(true);

    expect(
      await page.evaluate((secret) => document.documentElement.innerHTML.includes(secret), apiKey),
    ).toBe(false);
    expect(
      await page.evaluate(() =>
        (globalThis as any).__PAGE_EGRESS__.some((request: any) => request.hasAuth),
      ),
    ).toBe(false);

    await page.reload();
    await expect
      .poll(() =>
        worker.evaluate((id) => {
          const chromeApi = (globalThis as typeof globalThis & { chrome: typeof chrome }).chrome;
          return chromeApi.storage.session
            .get(`comvi_session_${id}`)
            .then((state) => state[`comvi_session_${id}`]);
        }, tabId),
      )
      .toBeUndefined();
    expect(await proxy(page, "/v1/project")).toMatchObject({ denied: true });

    await page.bringToFront();
    const forgetPopup = await openPopup(worker, extensionId, debuggingPort, connections);
    await expectIdle(forgetPopup, page);
    await expect(forgetPopup.locator("#api-key")).toHaveValue(apiKey);
    await forgetPopup.locator("#forget-key-btn").click();
    await expect
      .poll(() =>
        worker.evaluate(() => {
          const chromeApi = (globalThis as typeof globalThis & { chrome: typeof chrome }).chrome;
          return chromeApi.storage.local
            .get("comvi_credentials")
            .then((state) => state.comvi_credentials?.["http://127.0.0.1:8791"]);
        }),
      )
      .toBeUndefined();
    await forgetPopup.close();
    expect(await proxy(page, "/v1/project")).toMatchObject({ denied: true });
  } finally {
    await context.close();
  }
});
