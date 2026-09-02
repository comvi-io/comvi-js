/**
 * The standalone (CDN / Chrome-extension) runtime around `activate()`:
 * defaults it applies, what crosses the proxy transport boundary, which
 * translation refreshes it is allowed to apply, and what a deactivation must
 * hand back even when part of the teardown throws.
 *
 * `tests/plugin-options.test.ts` owns the collectContext opt-out and lifecycle
 * notification claims; this suite does not repeat them.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { createI18n, type ComposedHost } from "./helpers/composedHost";

const { coreCtorMock, coreStopMock, mockCoreModule, resetCoreMocks, FIRST_MOCK_CORE_ID } =
  await vi.hoisted(() => import("./helpers/mockCore"));

const { fetchApiTranslationsMock, clearProjectInfoCacheMock } = vi.hoisted(() => ({
  fetchApiTranslationsMock: vi.fn(),
  clearProjectInfoCacheMock: vi.fn(),
}));

vi.mock("@comvi/plugin-fetch-loader", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@comvi/plugin-fetch-loader")>();
  return {
    ...actual,
    fetchApiTranslations: fetchApiTranslationsMock,
    clearProjectInfoCache: clearProjectInfoCacheMock,
  };
});

vi.mock("../src/Core", mockCoreModule);

import { activate, deactivate, isActive } from "../src/standalone";
import { getApiConfig } from "../src/config/api";
import { resetEncoder } from "../src/translation";
import type { ApiTransport, ApiTransportInit } from "../src/config/api";

type CoreOptions = { targetElement?: Node; collectContext?: boolean };

function lastCoreOptions(): CoreOptions {
  expect(coreCtorMock).toHaveBeenCalled();
  return coreCtorMock.mock.calls[coreCtorMock.mock.calls.length - 1]![0] as CoreOptions;
}

function makeI18n(
  translation: Record<string, Record<string, string>> = {
    "en:default": { hello: "Hello" },
  },
): ComposedHost {
  return createI18n({ locale: "en", defaultNs: "default", translation });
}

/**
 * Drains the fire-and-forget refresh chain `activate()` kicks off. It is
 * microtasks only — no timers, no polling — so a fixed number of turns is
 * deterministic rather than a wait.
 */
async function settleRefresh(): Promise<void> {
  for (let turn = 0; turn < 12; turn += 1) {
    await Promise.resolve();
  }
}

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((settle) => {
    resolve = settle;
  });
  return { promise, resolve };
}

/**
 * The catalogs the refresh handed back to the host, as plain data. Core stores
 * catalogs on null-prototype objects, which a raw spy assertion cannot render.
 */
function addedCatalogs(spy: {
  mock: { calls: unknown[][] };
}): Array<Record<string, Record<string, string>>> {
  return spy.mock.calls.map(([update]) => JSON.parse(JSON.stringify(update)));
}

/** Drives one proxied request through the scoped fetch the refresh hands out. */
function refreshVia(request: (scopedFetch: typeof fetch) => Promise<unknown>): void {
  fetchApiTranslationsMock.mockImplementation(
    async (
      _apiKey: string,
      _locale: string,
      _namespaces: string[],
      _baseUrl: string,
      _timeout: unknown,
      scopedFetch: typeof fetch,
    ) => {
      await request(scopedFetch);
      return new Map();
    },
  );
}

afterEach(() => {
  if (isActive()) {
    deactivate();
  }
  delete (window as { __COMVI__?: unknown }).__COMVI__;
  resetCoreMocks();
  resetEncoder();
  fetchApiTranslationsMock.mockReset();
  clearProjectInfoCacheMock.mockReset();
});

describe("activate() defaults", () => {
  it("collects context and watches document.body when the caller asks for neither", () => {
    makeI18n();

    const result = activate({ refreshTranslations: false });

    expect(result?.collectContext).toBe(true);
    expect(lastCoreOptions()).toMatchObject({
      targetElement: document.body,
      collectContext: true,
    });
  });

  it("watches the element the caller names instead of document.body", () => {
    makeI18n();
    const target = document.createElement("section");

    activate({ targetElement: target, refreshTranslations: false });

    expect(lastCoreOptions().targetElement).toBe(target);
  });

  it("trims the api key before storing it in the runtime's configuration", () => {
    makeI18n();

    const result = activate({ apiKey: "  padded-key  ", refreshTranslations: false });

    expect(getApiConfig(result!.instanceId).apiKey).toBe("padded-key");
  });

  it("marks the page's translations so the DOM watcher can trace them back to keys", () => {
    const i18n = makeI18n();

    activate({ refreshTranslations: false });

    expect(i18n.t("hello")).toContainInvisibleChars();
  });

  it("announces the activated instance id", () => {
    makeI18n();
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);

    activate({ refreshTranslations: false });

    expect(info).toHaveBeenCalledWith(
      `[ComviInContextEditor] Activated (instance: ${FIRST_MOCK_CORE_ID})`,
    );
  });

  it("announces the deactivation", () => {
    makeI18n();
    const result = activate({ refreshTranslations: false });
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);

    result?.stop();

    expect(info).toHaveBeenCalledWith("[ComviInContextEditor] Deactivated");
  });
});

describe("activate() translation refresh", () => {
  it("skips the API round trip when refreshTranslations is false", async () => {
    makeI18n();

    activate({ apiKey: "test-key", refreshTranslations: false });
    await settleRefresh();

    expect(fetchApiTranslationsMock).not.toHaveBeenCalled();
  });

  it("performs the API round trip when refreshTranslations is explicitly true", async () => {
    makeI18n();
    fetchApiTranslationsMock.mockResolvedValue(new Map());

    activate({ apiKey: "test-key", refreshTranslations: true });
    await settleRefresh();

    expect(fetchApiTranslationsMock).toHaveBeenCalledTimes(1);
  });

  it("skips the API round trip when there is neither an api key nor a transport", async () => {
    makeI18n();

    activate({});
    await settleRefresh();

    expect(fetchApiTranslationsMock).not.toHaveBeenCalled();
  });

  it("re-adds only the page's own catalog when the API returns nothing", async () => {
    const i18n = makeI18n();
    const addTranslations = vi.spyOn(i18n, "addTranslations");
    fetchApiTranslationsMock.mockResolvedValue(new Map());

    activate({ apiKey: "test-key" });
    await settleRefresh();

    expect(addedCatalogs(addTranslations)).toEqual([{ "en:default": { hello: "Hello" } }]);
  });

  it("leaves an empty loaded namespace out of the re-added catalog", async () => {
    const i18n = makeI18n({ "en:default": { hello: "Hello" }, "en:empty": {} });
    const addTranslations = vi.spyOn(i18n, "addTranslations");
    fetchApiTranslationsMock.mockResolvedValue(new Map());

    activate({ apiKey: "test-key" });
    await settleRefresh();

    expect(addedCatalogs(addTranslations)).toEqual([{ "en:default": { hello: "Hello" } }]);
  });

  it("pushes no update at all when the page has no translations loaded", async () => {
    const i18n = createI18n({ locale: "en", defaultNs: "default" });
    const addTranslations = vi.spyOn(i18n, "addTranslations");

    activate({ apiKey: "test-key" });
    await settleRefresh();

    expect(addedCatalogs(addTranslations)).toEqual([]);
  });

  it("drops a refresh that resolves after a newer activation replaced the runtime", async () => {
    const i18n = makeI18n();
    const addTranslations = vi.spyOn(i18n, "addTranslations");
    const inFlight = createDeferred<Map<string, unknown>>();
    fetchApiTranslationsMock.mockReturnValueOnce(inFlight.promise);

    const first = activate({ apiKey: "test-key" });
    first?.stop();
    activate({ apiKey: "test-key", refreshTranslations: false });
    inFlight.resolve(new Map());
    await settleRefresh();

    expect(addedCatalogs(addTranslations)).toEqual([]);
  });

  it("drops a refresh that resolves after the runtime was stopped", async () => {
    const i18n = makeI18n();
    const addTranslations = vi.spyOn(i18n, "addTranslations");
    const inFlight = createDeferred<Map<string, unknown>>();
    fetchApiTranslationsMock.mockReturnValue(inFlight.promise);

    const result = activate({ apiKey: "test-key" });
    result?.stop();
    inFlight.resolve(new Map());
    await settleRefresh();

    expect(addedCatalogs(addTranslations)).toEqual([]);
  });
});

describe("activate() proxy transport", () => {
  const transport = () => vi.fn<ApiTransport>(async () => new Response("{}", { status: 200 }));

  function transportInits(mock: ReturnType<typeof transport>): Array<ApiTransportInit | undefined> {
    return mock.mock.calls.map(([, init]) => init);
  }

  it("forwards a request that carries no init at all", async () => {
    makeI18n();
    const proxy = transport();
    refreshVia((scopedFetch) => scopedFetch("https://page.invalid/v1/ping?locale=en"));

    activate({ transport: proxy, apiBaseUrl: "https://api.comvi.io", collectContext: false });
    await settleRefresh();

    expect(proxy.mock.calls[0]?.[0]).toBe("/v1/ping?locale=en");
    expect(transportInits(proxy)).toEqual([{}]);
  });

  it("refuses to forward a request body that is not a string", async () => {
    makeI18n();
    const proxy = transport();
    refreshVia((scopedFetch) =>
      scopedFetch("https://page.invalid/v1/keys", {
        method: "POST",
        body: new Uint8Array([1, 2, 3]),
      }),
    );

    activate({ transport: proxy, apiBaseUrl: "https://api.comvi.io", collectContext: false });
    await settleRefresh();

    expect(transportInits(proxy)).toEqual([{ method: "POST" }]);
  });
});

describe("deactivate() teardown", () => {
  it("clears the fetch-loader's project cache for the runtime's own scope", () => {
    makeI18n();
    const result = activate({ refreshTranslations: false });

    result?.stop();

    expect(clearProjectInfoCacheMock).toHaveBeenCalledExactlyOnceWith(FIRST_MOCK_CORE_ID);
  });

  it("finishes teardown and rethrows when Core.stop() fails", () => {
    makeI18n();
    coreStopMock.mockImplementation(() => {
      throw new Error("core boom");
    });
    const result = activate({ refreshTranslations: false });

    expect(() => result?.stop()).toThrow("core boom");

    expect(isActive()).toBe(false);
    expect(() => getApiConfig(FIRST_MOCK_CORE_ID)).toThrow(/API configuration not initialized/);
  });

  it("stays silent when a stale stop handle is called a second time", () => {
    makeI18n();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const result = activate({ refreshTranslations: false });

    result?.stop();
    result?.stop();

    expect(warn).not.toHaveBeenCalled();
  });
});
