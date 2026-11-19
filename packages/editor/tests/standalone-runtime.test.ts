/**
 * The standalone runtime around `activate()`, on a REAL core 0.8 instance composed with
 * `devtools()`: the defaults it applies, that context collection is off, what crosses the
 * proxy transport boundary, which translation refreshes it applies, and what a deactivation
 * must hand back even when part of the teardown throws.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import type { I18n, Loader } from "@comvi/core";

const { fetchApiTranslationsMock, clearProjectInfoCacheMock } = vi.hoisted(() => ({
  fetchApiTranslationsMock: vi.fn(),
  clearProjectInfoCacheMock: vi.fn(),
}));

vi.mock("../src/api-fetch", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/api-fetch")>();
  return {
    ...actual,
    fetchApiTranslations: fetchApiTranslationsMock,
    clearProjectInfoCache: clearProjectInfoCacheMock,
  };
});

import { activate, deactivate, isActive, EDITOR_LIFECYCLE_EVENT } from "../src/standalone";
import { Core } from "../src/Core";
import { decodeFrames, FRAME_START } from "../src/marker";
import { getApiConfig, resetApiConfig } from "../src/config/api";
import type { ApiTransport, ApiTransportInit } from "../src/config/api";
import { cleanupDOM, flushDOMMutations } from "./helpers";
import { hoverLabel, hoverOverlayStyle, renderMarked, renderText } from "./helpers/editorPage";
import { contextApiResponse, contextPaths } from "./helpers/contextWire";
import { marker } from "./helpers/frames";
import { pageInstance } from "./helpers/session";

/** The scope id of every Core that started, in order (the API config is keyed by it). */
function startedScopes(): string[] {
  const scopes: string[] = [];
  const realStart = Core.prototype.start;
  vi.spyOn(Core.prototype, "start").mockImplementation(function (this: Core) {
    scopes.push(this.getInstanceId());
    realStart.call(this);
  });
  return scopes;
}

/**
 * Fault injection: `Core.stop()` finishes its real teardown, so nothing leaks into later
 * tests, and then throws — the failure `deactivate()` must survive.
 */
function failCoreStopWith(message: string): void {
  const realStop = Core.prototype.stop;
  vi.spyOn(Core.prototype, "stop").mockImplementation(function (this: Core) {
    realStop.call(this);
    throw new Error(message);
  });
}

const instances: I18n[] = [];
function makeI18n(messages: Record<string, string> = { hello: "Hello" }): I18n {
  const i18n = pageInstance({ messages: { en: messages } });
  instances.push(i18n);
  return i18n;
}

/** Drains the refresh chain `activate()` kicks off: microtasks only, no timers. */
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

const stopOf = (result: ReturnType<typeof activate>) => () =>
  result.ok ? result.stop() : undefined;

afterEach(() => {
  if (isActive()) {
    deactivate();
  }
  for (const i18n of instances.splice(0)) i18n.destroy();
  delete (window as { __COMVI__?: unknown }).__COMVI__;
  cleanupDOM();
  resetApiConfig();
  fetchApiTranslationsMock.mockReset();
  clearProjectInfoCacheMock.mockReset();
});

describe("activate() defaults", () => {
  it("activate() without targetElement → marked text anywhere in the body is highlighted", async () => {
    makeI18n();
    const nested = document.createElement("section");
    document.body.appendChild(nested);
    const heading = renderMarked("home.title", { parent: nested });

    activate({ refreshMessages: false });

    expect(await hoverLabel(heading)).toBe("home.title");
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
    const scopes = startedScopes();

    activate({ apiKey: "  padded-key  ", refreshMessages: false });

    expect(getApiConfig(scopes[0]).apiKey).toBe("padded-key");
  });

  it("marks the instance: t() output carries the frame of its key", () => {
    const i18n = makeI18n();

    activate({ refreshMessages: false });

    expect(decodeFrames(i18n.t("hello"))).toMatchObject([
      { inst: "", ns: "default", key: "hello", close: false },
    ]);
  });

  it("a marked t() output rendered after activation is highlighted with its key", async () => {
    const i18n = makeI18n();
    activate({ refreshMessages: false });

    const paragraph = renderText(i18n.t("hello"));

    expect(await hoverLabel(paragraph)).toBe("hello");
  });

  it("announces the activation and the deactivation, without an instance id", () => {
    makeI18n();
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const events: unknown[] = [];
    const onEvent = (event: Event) => events.push((event as CustomEvent).detail);
    window.addEventListener(EDITOR_LIFECYCLE_EVENT, onEvent);
    const onLifecycle = vi.fn();

    const result = activate({ apiKey: "test-key", refreshMessages: false, onLifecycle });
    stopOf(result)();
    window.removeEventListener(EDITOR_LIFECYCLE_EVENT, onEvent);

    expect({
      info: info.mock.calls.map(([line]) => line),
      events,
      callback: onLifecycle.mock.calls.map(([detail]) => detail),
    }).toEqual({
      info: ["[@comvi/editor] Activated", "[@comvi/editor] Deactivated"],
      events: [{ state: "activated" }, { state: "deactivated" }],
      callback: [{ state: "activated" }, { state: "deactivated" }],
    });
  });
});

describe("the API key stays out of the page", () => {
  it("not in the DOM, in any frame, in a log line or in the lifecycle event", async () => {
    const KEY = "sk_live_must_not_leak_0123456789";
    const i18n = makeI18n();
    const lines: unknown[] = [];
    for (const level of ["log", "info", "warn", "error", "debug"] as const)
      vi.spyOn(console, level).mockImplementation((...args) => void lines.push(args));
    const events: unknown[] = [];
    const onEvent = (event: Event) => events.push((event as CustomEvent).detail);
    window.addEventListener(EDITOR_LIFECYCLE_EVENT, onEvent);

    const result = activate({ apiKey: KEY, refreshMessages: false });
    const paragraph = renderText(i18n.t("hello"));
    await hoverLabel(paragraph);
    const frames = decodeFrames(document.body.innerHTML + i18n.t("hello"));
    stopOf(result)();
    window.removeEventListener(EDITOR_LIFECYCLE_EVENT, onEvent);

    expect({
      dom: document.documentElement.outerHTML.includes(KEY),
      frames: JSON.stringify(frames).includes(KEY),
      logs: JSON.stringify(lines).includes(KEY),
      events: JSON.stringify(events).includes(KEY),
      result: JSON.stringify(result).includes(KEY),
      framesSeen: frames.length > 0,
    }).toEqual({
      dom: false,
      frames: false,
      logs: false,
      events: false,
      result: false,
      framesSeen: true,
    });
  });
});

describe("context collection is off (owner D4)", () => {
  it("the result reports collectContext: false", () => {
    makeI18n();

    const result = activate({ refreshMessages: false });

    expect(result).toMatchObject({ ok: true, collectContext: false });
  });

  it("a session with marked text, DOM changes and navigation → no request to the context routes", async () => {
    makeI18n();
    renderMarked("hello");
    const transport = vi.fn<ApiTransport>((path) => contextApiResponse(path));

    activate({ transport, refreshMessages: false });
    await flushDOMMutations();
    renderMarked("later.key");
    history.pushState({}, "", "/next-page");
    window.dispatchEvent(new PopStateEvent("popstate"));
    history.replaceState({}, "", "/next-page#section");
    window.dispatchEvent(new HashChangeEvent("hashchange"));
    document.dispatchEvent(new Event("visibilitychange"));
    window.dispatchEvent(new Event("pagehide"));
    await flushDOMMutations();
    await settleRefresh();

    expect(contextPaths(transport.mock.calls)).toEqual([]);
  });

  it("a session with an API key → no fetch to the context routes", async () => {
    makeI18n();
    renderMarked("hello");
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(async (input) => contextApiResponse(String(input)));

    activate({ apiKey: "test-key", refreshMessages: false });
    await flushDOMMutations();
    history.pushState({}, "", "/other");
    window.dispatchEvent(new PopStateEvent("popstate"));
    await flushDOMMutations();
    await settleRefresh();

    expect(contextPaths(fetchSpy.mock.calls)).toEqual([]);
  });
});

describe("activate() translation refresh", () => {
  it("skips the API round trip when refreshMessages is false", async () => {
    makeI18n();

    activate({ apiKey: "test-key", refreshMessages: false });
    await settleRefresh();

    expect(fetchApiTranslationsMock).not.toHaveBeenCalled();
  });

  it("performs one API round trip per loaded locale, for its loaded namespaces", async () => {
    makeI18n();
    fetchApiTranslationsMock.mockResolvedValue(new Map());

    activate({ apiKey: "test-key" });
    await settleRefresh();

    expect(fetchApiTranslationsMock.mock.calls.map(([, locale, nss]) => [locale, nss])).toEqual([
      ["en", ["default"]],
    ]);
  });

  it("skips the API round trip when there is neither an api key nor a transport", async () => {
    makeI18n();

    activate({});
    await settleRefresh();

    expect(fetchApiTranslationsMock).not.toHaveBeenCalled();
  });

  it("writes the fetched messages into the loaded pair: t() renders them", async () => {
    const i18n = makeI18n();
    fetchApiTranslationsMock.mockResolvedValue(
      new Map([["en:default", { hello: "Hello from the platform" }]]),
    );

    activate({ apiKey: "test-key" });
    await settleRefresh();

    expect(i18n.t("hello", { markers: false })).toBe("Hello from the platform");
  });

  it("a pair the platform returns but the instance never loaded is not written (its own load stays)", async () => {
    const loader = vi.fn<Loader>(async (_locale, ns) =>
      ns === "shop" ? { cart: "Cart" } : ({} as Record<string, string>),
    );
    const i18n = pageInstance({ loader });
    instances.push(i18n);
    await i18n.ready;
    fetchApiTranslationsMock.mockResolvedValue(
      new Map([
        ["en:default", {}],
        ["en:shop", { cart: "Platform cart" }],
      ]),
    );

    activate({ apiKey: "test-key" });
    await settleRefresh();
    await i18n.load("shop");

    expect(i18n.ns("shop")("cart", { markers: false })).toBe("Cart");
  });

  it("drops a refresh that resolves after the runtime was stopped", async () => {
    const i18n = makeI18n();
    const inFlight = createDeferred<Map<string, unknown>>();
    fetchApiTranslationsMock.mockReturnValue(inFlight.promise);

    const result = activate({ apiKey: "test-key" });
    stopOf(result)();
    inFlight.resolve(new Map([["en:default", { hello: "Stale" }]]));
    await settleRefresh();

    expect(i18n.t("hello")).toBe("Hello");
  });

  it("drops a refresh that resolves after a newer activation replaced the runtime", async () => {
    const i18n = makeI18n();
    const inFlight = createDeferred<Map<string, unknown>>();
    fetchApiTranslationsMock.mockReturnValueOnce(inFlight.promise);

    const first = activate({ apiKey: "test-key" });
    stopOf(first)();
    activate({ apiKey: "test-key", refreshMessages: false });
    inFlight.resolve(new Map([["en:default", { hello: "Stale" }]]));
    await settleRefresh();

    expect(i18n.t("hello", { markers: false })).toBe("Hello");
  });

  it("refresh that fails after the runtime was stopped → no refresh warning is logged", async () => {
    makeI18n();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const inFlight = createDeferred<Map<string, unknown>>();
    fetchApiTranslationsMock.mockReturnValue(inFlight.promise);
    const result = activate({ apiKey: "test-key" });
    stopOf(result)();

    inFlight.reject(new Error("network down"));
    await settleRefresh();

    expect(warn).not.toHaveBeenCalled();
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

    activate({ transport: proxy, apiBaseUrl: "https://api.comvi.io" });
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

    activate({ transport: proxy, apiBaseUrl: "https://api.comvi.io" });
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

  it("deactivate() → new t() output carries no frame (x.mark(null))", () => {
    const i18n = makeI18n();
    activate({ refreshMessages: false });

    deactivate();

    expect(i18n.t("hello").includes(FRAME_START)).toBe(false);
  });

  it("a frame already rendered before deactivation still decodes in the next session", async () => {
    const i18n = makeI18n();
    activate({ refreshMessages: false });
    const paragraph = renderText(i18n.t("hello"));
    deactivate();

    activate({ refreshMessages: false });

    expect(await hoverLabel(paragraph)).toBe("hello");
  });

  it("clears the API fetcher's project cache for the runtime's own scope", () => {
    makeI18n();
    const scopes = startedScopes();
    const result = activate({ refreshMessages: false });

    stopOf(result)();

    expect(clearProjectInfoCacheMock).toHaveBeenCalledExactlyOnceWith(scopes[0]);
  });

  it("Core.stop() throws → deactivation rethrows the failure", () => {
    makeI18n();
    failCoreStopWith("core boom");
    const result = activate({ refreshMessages: false });

    expect(stopOf(result)).toThrow("core boom");
  });

  it("Core.stop() throws → the runtime is still reported inactive and the instance unmarked", () => {
    const i18n = makeI18n();
    failCoreStopWith("core boom");
    const result = activate({ refreshMessages: false });

    expect(stopOf(result)).toThrow("core boom");

    expect({ active: isActive(), text: i18n.t("hello") }).toEqual({ active: false, text: "Hello" });
  });

  it("Core.stop() throws → the runtime's API configuration is still dropped", () => {
    makeI18n();
    failCoreStopWith("core boom");
    const scopes = startedScopes();
    const result = activate({ refreshMessages: false });

    expect(stopOf(result)).toThrow("core boom");

    expect(() => getApiConfig(scopes[0])).toThrow(/API configuration not initialized/);
  });

  it("stays silent when a stale stop handle is called a second time", () => {
    makeI18n();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const result = activate({ refreshMessages: false });

    stopOf(result)();
    stopOf(result)();

    expect(warn).not.toHaveBeenCalled();
  });

  it("a frame of the marker helper and of t() are the same frame", () => {
    const i18n = makeI18n();
    activate({ refreshMessages: false });

    expect(i18n.t("hello")).toBe(`Hello${marker("hello")}`);
  });
});
