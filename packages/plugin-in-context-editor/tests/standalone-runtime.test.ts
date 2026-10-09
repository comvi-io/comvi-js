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
import {
  createDiscoverableBaseI18n,
  createI18n,
  type ComposedInstance,
} from "./helpers/composedInstance";

const { fetchApiTranslationsMock, clearProjectInfoCacheMock } = vi.hoisted(() => ({
  fetchApiTranslationsMock: vi.fn(),
  clearProjectInfoCacheMock: vi.fn(),
}));

vi.mock("@comvi/plugin-fetch-loader/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@comvi/plugin-fetch-loader/api")>();
  return {
    ...actual,
    fetchApiTranslations: fetchApiTranslationsMock,
    clearProjectInfoCache: clearProjectInfoCacheMock,
  };
});

import { activate, deactivate, isActive } from "../src/standalone";
import { Core } from "../src/Core";
import { getApiConfig, resetApiConfig } from "../src/config/api";
import { encodeKeyToInvisible, registerKey, resetEncoder } from "../src/translation";
import type { ApiTransport, ApiTransportInit } from "../src/config/api";
import { cleanupDOM, flushDOMMutations } from "./helpers";
import { hoverLabel, hoverOverlayStyle, renderMarked } from "./helpers/editorPage";
import { contextApiResponse, contextPaths, handshakeKeys } from "./helpers/contextWire";

/**
 * Fault injection: `Core.stop()` finishes its real teardown, so nothing leaks
 * into later tests, and then throws — the failure `deactivate()` must survive.
 */
function failCoreStopWith(message: string): void {
  const realStop = Core.prototype.stop;
  vi.spyOn(Core.prototype, "stop").mockImplementation(function (this: Core) {
    realStop.call(this);
    throw new Error(message);
  });
}

function makeI18n(
  messages: Record<string, Record<string, string>> = {
    "en:default": { hello: "Hello" },
  },
): ComposedInstance {
  return createI18n({ locale: "en", defaultNs: "default", messages });
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
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((settle, fail) => {
    resolve = settle;
    reject = fail;
  });
  return { promise, resolve, reject };
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
  cleanupDOM();
  document.head.querySelector("title")?.remove();
  resetApiConfig();
  resetEncoder();
  fetchApiTranslationsMock.mockReset();
  clearProjectInfoCacheMock.mockReset();
});

describe("activate() defaults", () => {
  it("activate() without collectContext → the result reports collectContext: true", () => {
    makeI18n();

    const result = activate({ refreshMessages: false });

    expect(result?.collectContext).toBe(true);
  });

  it("activate() without collectContext → the context handshake goes through the transport", async () => {
    makeI18n();
    renderMarked("hello");
    const transport = vi.fn<ApiTransport>((path) => contextApiResponse(path));

    activate({ transport, refreshMessages: false });
    await flushDOMMutations();

    expect(contextPaths(transport.mock.calls)).toContain("/v1/context/handshake");
  });

  it("activate() without targetElement → marked text anywhere in the body is highlighted", async () => {
    makeI18n();
    const nested = document.createElement("section");
    document.body.appendChild(nested);
    const heading = renderMarked("home.title", { parent: nested });

    activate({ refreshMessages: false });

    expect(await hoverLabel(heading)).toBe("home.title");
  });

  it("activate() without targetElement → a translated <title> in the head is not tracked", async () => {
    makeI18n();
    renderMarked("home.title");
    document.title = `Shop${encodeKeyToInvisible(registerKey("page.title"))}`;
    const transport = vi.fn<ApiTransport>((path) => contextApiResponse(path));

    activate({ transport, refreshMessages: false });
    await flushDOMMutations();

    expect(handshakeKeys(transport.mock.calls)).toEqual(["home.title"]);
  });

  it("activate({ targetElement }) → marked text inside the target is highlighted", async () => {
    makeI18n();
    const target = document.createElement("section");
    document.body.appendChild(target);
    const heading = renderMarked("home.title", { parent: target });

    activate({ targetElement: target, refreshMessages: false });

    expect(await hoverLabel(heading)).toBe("home.title");
  });

  it("activate({ targetElement }) → marked text outside the target is not highlighted", async () => {
    makeI18n();
    const target = document.createElement("section");
    document.body.appendChild(target);
    const outside = renderMarked("footer.copyright");

    activate({ targetElement: target, refreshMessages: false });

    expect(await hoverLabel(outside)).toBeNull();
  });

  it("activate({ highlightStyle }) → the Alt+hover overlay is drawn in that style", async () => {
    makeI18n();
    const heading = renderMarked("home.title");

    activate({
      highlightStyle: { borderColor: "red", backgroundColor: "pink", borderWidth: 3 },
      refreshMessages: false,
    });

    expect(await hoverOverlayStyle(heading)).toEqual({
      border: "3px solid red",
      backgroundColor: "pink",
    });
  });

  it("trims the api key before storing it in the runtime's configuration", () => {
    makeI18n();

    const result = activate({ apiKey: "  padded-key  ", refreshMessages: false });

    expect(getApiConfig(result!.instanceId).apiKey).toBe("padded-key");
  });

  it("marks the page's translations so the DOM watcher can trace them back to keys", () => {
    const i18n = makeI18n();

    activate({ refreshMessages: false });

    expect(i18n.t("hello")).toContainInvisibleChars();
  });

  it("announces the activated instance id", () => {
    makeI18n();
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);

    const result = activate({ refreshMessages: false });

    expect(info).toHaveBeenCalledWith(
      `[@comvi/plugin-in-context-editor] Activated (instance: ${result?.instanceId})`,
    );
  });

  it("announces the deactivation", () => {
    makeI18n();
    const result = activate({ refreshMessages: false });
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);

    result?.stop();

    expect(info).toHaveBeenCalledWith("[@comvi/plugin-in-context-editor] Deactivated");
  });
});

describe("activate() instance selection", () => {
  it("an instance without the plugin capability → returns null instead of throwing", () => {
    createDiscoverableBaseI18n({ locale: "en", messages: { "en:default": { hello: "Hello" } } });
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const result = activate({ refreshMessages: false });

    expect(result).toBeNull();
    expect(isActive()).toBe(false);
    expect(error).toHaveBeenCalledOnce();
  });

  it("an instance without the plugin capability → the error names the missing @comvi/core/plugins capability", () => {
    createDiscoverableBaseI18n({ locale: "en", messages: { "en:default": { hello: "Hello" } } });
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);

    activate({ refreshMessages: false });

    expect(error).toHaveBeenCalledExactlyOnceWith(
      "[@comvi/plugin-in-context-editor] This i18n instance cannot be edited: it was created without the plugin capability (`@comvi/core/plugins`).",
    );
  });

  it("no instanceId → edits the instance with the plugin capability over an earlier one without it", () => {
    createDiscoverableBaseI18n({ locale: "en", messages: { "en:default": { hello: "Hello" } } });
    const editable = makeI18n();

    activate({ refreshMessages: false });

    expect(editable.t("hello")).toContainInvisibleChars();
  });

  it("an instanceId naming an instance without the plugin capability → returns null", () => {
    makeI18n();
    createDiscoverableBaseI18n({ locale: "en", instanceId: "base-only" });
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    const result = activate({ instanceId: "base-only", refreshMessages: false });

    expect(result).toBeNull();
  });
});

describe("activate() translation refresh", () => {
  it("skips the API round trip when refreshMessages is false", async () => {
    makeI18n();

    activate({ apiKey: "test-key", refreshMessages: false });
    await settleRefresh();

    expect(fetchApiTranslationsMock).not.toHaveBeenCalled();
  });

  it("refreshMessages false → still re-adds the page's own catalog so rendered text gets marked", () => {
    const i18n = makeI18n();
    const addMessages = vi.spyOn(i18n, "addMessages");

    activate({ apiKey: "test-key", refreshMessages: false });

    expect(addedCatalogs(addMessages)).toEqual([{ "en:default": { hello: "Hello" } }]);
  });

  it("performs the API round trip when refreshMessages is explicitly true", async () => {
    makeI18n();
    fetchApiTranslationsMock.mockResolvedValue(new Map());

    activate({ apiKey: "test-key", refreshMessages: true });
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
    const addMessages = vi.spyOn(i18n, "addMessages");
    fetchApiTranslationsMock.mockResolvedValue(new Map());

    activate({ apiKey: "test-key" });
    await settleRefresh();

    expect(addedCatalogs(addMessages)).toEqual([{ "en:default": { hello: "Hello" } }]);
  });

  it("leaves an empty loaded namespace out of the re-added catalog", async () => {
    const i18n = makeI18n({ "en:default": { hello: "Hello" }, "en:empty": {} });
    const addMessages = vi.spyOn(i18n, "addMessages");
    fetchApiTranslationsMock.mockResolvedValue(new Map());

    activate({ apiKey: "test-key" });
    await settleRefresh();

    expect(addedCatalogs(addMessages)).toEqual([{ "en:default": { hello: "Hello" } }]);
  });

  it("pushes no update at all when the page has no translations loaded", async () => {
    const i18n = createI18n({ locale: "en", defaultNs: "default" });
    const addMessages = vi.spyOn(i18n, "addMessages");

    activate({ apiKey: "test-key" });
    await settleRefresh();

    expect(addedCatalogs(addMessages)).toEqual([]);
  });

  it("drops a refresh that resolves after a newer activation replaced the runtime", async () => {
    const i18n = makeI18n();
    const addMessages = vi.spyOn(i18n, "addMessages");
    const inFlight = createDeferred<Map<string, unknown>>();
    fetchApiTranslationsMock.mockReturnValueOnce(inFlight.promise);

    const first = activate({ apiKey: "test-key" });
    first?.stop();
    activate({ apiKey: "test-key", refreshMessages: false });
    // The newer runtime's own local re-add is not the stale refresh's doing.
    addMessages.mockClear();

    inFlight.resolve(new Map());
    await settleRefresh();

    expect(addedCatalogs(addMessages)).toEqual([]);
  });

  it("drops a refresh that resolves after the runtime was stopped", async () => {
    const i18n = makeI18n();
    const addMessages = vi.spyOn(i18n, "addMessages");
    const inFlight = createDeferred<Map<string, unknown>>();
    fetchApiTranslationsMock.mockReturnValue(inFlight.promise);

    const result = activate({ apiKey: "test-key" });
    result?.stop();
    inFlight.resolve(new Map());
    await settleRefresh();

    expect(addedCatalogs(addMessages)).toEqual([]);
  });

  it("refresh that fails after the runtime was stopped → no refresh warning is logged", async () => {
    makeI18n();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const inFlight = createDeferred<Map<string, unknown>>();
    fetchApiTranslationsMock.mockReturnValue(inFlight.promise);
    const result = activate({ apiKey: "test-key" });
    result?.stop();

    inFlight.reject(new Error("network down"));
    await settleRefresh();

    expect(warn).not.toHaveBeenCalled();
  });

  it("RC review #11: drops a NON-EMPTY refresh that resolves after the runtime was stopped", async () => {
    const i18n = makeI18n();
    const addMessages = vi.spyOn(i18n, "addMessages");
    const inFlight = createDeferred<Map<string, unknown>>();
    fetchApiTranslationsMock.mockReturnValue(inFlight.promise);

    const result = activate({ apiKey: "test-key" });
    result?.stop();
    // The in-flight refresh resolves AFTER teardown with real, non-empty
    // data — the identity guard must reject the merge itself, not only the
    // later render refresh (which an empty map could never exercise).
    inFlight.resolve(new Map([["en:default", { hello: "Stale" }]]));
    await settleRefresh();

    expect(addedCatalogs(addMessages)).toEqual([]);
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
  it("deactivate() → the page's marked text is no longer highlighted", async () => {
    makeI18n();
    const heading = renderMarked("home.title");
    activate({ refreshMessages: false });

    deactivate();

    expect(await hoverLabel(heading)).toBeNull();
  });

  it("clears the fetch-loader's project cache for the runtime's own scope", () => {
    makeI18n();
    const result = activate({ refreshMessages: false });

    result?.stop();

    expect(clearProjectInfoCacheMock).toHaveBeenCalledExactlyOnceWith(result?.instanceId);
  });

  it("Core.stop() throws → deactivation rethrows the failure", () => {
    makeI18n();
    failCoreStopWith("core boom");
    const result = activate({ refreshMessages: false });

    expect(() => result?.stop()).toThrow("core boom");
  });

  it("Core.stop() throws → the runtime is still reported inactive", () => {
    makeI18n();
    failCoreStopWith("core boom");
    const result = activate({ refreshMessages: false });

    expect(() => result?.stop()).toThrow("core boom");

    expect(isActive()).toBe(false);
  });

  it("Core.stop() throws → the runtime's API configuration is still dropped", () => {
    makeI18n();
    failCoreStopWith("core boom");
    const result = activate({ refreshMessages: false });

    expect(() => result?.stop()).toThrow("core boom");

    expect(() => getApiConfig(result?.instanceId)).toThrow(/API configuration not initialized/);
  });

  it("stays silent when a stale stop handle is called a second time", () => {
    makeI18n();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const result = activate({ refreshMessages: false });

    result?.stop();
    result?.stop();

    expect(warn).not.toHaveBeenCalled();
  });
});
