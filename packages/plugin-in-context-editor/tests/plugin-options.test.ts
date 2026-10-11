/**
 * Regression guard for the public opt-outs: both activation entry points
 * (the plugin factory and the standalone `activate`) must honour
 * collectContext/screenGroupResolver — a dropped option here silently
 * re-enables collection for integrations that opted out. Read at the wire:
 * the real runtime runs, and the requests under `/v1/context/` are what the
 * platform would receive.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { asPluginHost, createI18n } from "./helpers/composedInstance";

const { fetchApiTranslationsMock } = vi.hoisted(() => ({
  fetchApiTranslationsMock: vi.fn(),
}));

vi.mock("@comvi/plugin-fetch-loader/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@comvi/plugin-fetch-loader/api")>();
  return {
    ...actual,
    fetchApiTranslations: fetchApiTranslationsMock,
  };
});

import { inContextEditorPlugin } from "../src/index";
import { resetApiConfig, type ApiTransport } from "../src/config/api";
import { resetEncoder } from "../src/translation";
import {
  activate,
  deactivate,
  EDITOR_LIFECYCLE_EVENT,
  getStatus,
  isActive,
  type EditorLifecycleDetail,
} from "../src/standalone";
import { cleanupDOM, flushDOMMutations } from "./helpers";
import { hoverLabel, renderMarked } from "./helpers/editorPage";
import { contextApiResponse, contextPaths, reportedScreenGroups } from "./helpers/contextWire";

function makeI18n(options: { apiKey?: string; collectContext?: boolean } = {}) {
  return createI18n({
    locale: "en",
    defaultNs: "default",
    messages: { "en:default": { hello: "Hello" } },
    ...options,
  });
}

/** `fetch` answering the context API, for the plugin path (it authenticates with the host's key). */
function stubContextFetch() {
  const fetchMock = vi.fn((input: RequestInfo | URL) =>
    contextApiResponse(input instanceof Request ? input.url : String(input)),
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

/** A transport answering the context API, for the standalone path. */
function contextTransport() {
  return vi.fn<ApiTransport>((path) => contextApiResponse(path));
}

const pluginTeardowns: Array<() => void> = [];

/** Installs the plugin over a page that already shows one translated paragraph. */
function installOverTranslatedPage(options?: Parameters<typeof inContextEditorPlugin>[0]): void {
  renderMarked("hello");
  const i18n = makeI18n({ apiKey: "test-key" });
  pluginTeardowns.push(inContextEditorPlugin(options)(asPluginHost(i18n)) as () => void);
}

function resetStandaloneRuntime(): void {
  if (isActive()) {
    deactivate();
  }
  for (const teardown of pluginTeardowns.splice(0)) teardown();
  delete (window as { __COMVI__?: unknown }).__COMVI__;
  fetchApiTranslationsMock.mockReset();
  cleanupDOM();
  resetApiConfig();
  resetEncoder();
}

describe("collectContext / screenGroupResolver on the plugin path", () => {
  afterEach(resetStandaloneRuntime);

  it("inContextEditorPlugin() without collectContext → the context handshake and usages reach the API", async () => {
    const fetchMock = stubContextFetch();

    installOverTranslatedPage();
    await flushDOMMutations();

    expect(contextPaths(fetchMock.mock.calls)).toEqual([
      "/v1/context/handshake",
      "/v1/context/usages",
    ]);
  });

  it("inContextEditorPlugin({ collectContext: false }) → no context request reaches the API", async () => {
    const fetchMock = stubContextFetch();

    installOverTranslatedPage({ collectContext: false });
    await flushDOMMutations();

    expect(contextPaths(fetchMock.mock.calls)).toEqual([]);
  });

  it("inContextEditorPlugin({ screenGroupResolver }) → reported usages carry the resolver's screen group", async () => {
    const fetchMock = stubContextFetch();

    installOverTranslatedPage({ screenGroupResolver: () => "/users/:id" });
    await flushDOMMutations();

    expect(reportedScreenGroups(fetchMock.mock.calls)).toEqual(["/users/:id"]);
  });
});

describe("collectContext / screenGroupResolver on the standalone path", () => {
  afterEach(resetStandaloneRuntime);

  it("activate({ collectContext: false }) → no context request goes through the transport", async () => {
    makeI18n();
    renderMarked("hello");
    const transport = contextTransport();

    activate({ transport, collectContext: false, refreshMessages: false });
    await flushDOMMutations();

    expect(contextPaths(transport.mock.calls)).toEqual([]);
  });

  it("activate({ collectContext: false }) → the result reports collectContext: false", () => {
    makeI18n();

    const result = activate({ collectContext: false, refreshMessages: false });

    expect(result?.collectContext).toBe(false);
  });

  it("activate({ screenGroupResolver }) → reported usages carry the resolver's screen group", async () => {
    makeI18n();
    renderMarked("hello");
    const transport = contextTransport();

    activate({ transport, screenGroupResolver: () => "/checkout", refreshMessages: false });
    await flushDOMMutations();

    expect(reportedScreenGroups(transport.mock.calls)).toEqual(["/checkout"]);
  });

  it("site created with collectContext: false, activate({ collectContext: true }) → the result reports false", () => {
    makeI18n({ collectContext: false });

    const result = activate({ collectContext: true, refreshMessages: false });

    expect(result?.collectContext).toBe(false);
  });

  it("site created with collectContext: false, activate({ collectContext: true }) → no context request goes through the transport", async () => {
    makeI18n({ collectContext: false });
    renderMarked("hello");
    const transport = contextTransport();

    activate({ transport, collectContext: true, refreshMessages: false });
    await flushDOMMutations();

    expect(contextPaths(transport.mock.calls)).toEqual([]);
  });
});

describe("standalone lifecycle notifications", () => {
  afterEach(resetStandaloneRuntime);

  it("notifies callback and DOM observers when the returned stop function deactivates", () => {
    makeI18n();
    const callback = vi.fn<(detail: EditorLifecycleDetail) => void>();
    const eventDetails: EditorLifecycleDetail[] = [];
    const listener = (event: Event) => {
      eventDetails.push((event as CustomEvent<EditorLifecycleDetail>).detail);
    };
    window.addEventListener(EDITOR_LIFECYCLE_EVENT, listener);

    const result = activate({ refreshMessages: false, onLifecycle: callback });
    expect(result).not.toBeNull();
    result?.stop();
    window.removeEventListener(EDITOR_LIFECYCLE_EVENT, listener);

    expect(callback.mock.calls.map(([detail]) => detail.state)).toEqual([
      "activated",
      "deactivated",
    ]);
    expect(eventDetails.map(({ state }) => state)).toEqual(["activated", "deactivated"]);
    expect(isActive()).toBe(false);
  });

  it("keeps the api key out of the lifecycle detail handed to observers", () => {
    makeI18n();
    const eventDetails: EditorLifecycleDetail[] = [];
    const listener = (event: Event) => {
      eventDetails.push((event as CustomEvent<EditorLifecycleDetail>).detail);
    };
    window.addEventListener(EDITOR_LIFECYCLE_EVENT, listener);

    const result = activate({
      apiKey: "must-not-appear-in-lifecycle",
      refreshMessages: false,
    });
    result?.stop();
    window.removeEventListener(EDITOR_LIFECYCLE_EVENT, listener);

    expect(eventDetails).toEqual([
      { state: "activated", instanceId: result?.instanceId },
      { state: "deactivated", instanceId: result?.instanceId },
    ]);
  });

  it("notifies observers when the global deactivate entry point is called", () => {
    makeI18n();
    const listener = vi.fn();
    window.addEventListener(EDITOR_LIFECYCLE_EVENT, listener);

    activate({ refreshMessages: false });
    window.ComviInContextEditor?.deactivate();
    window.removeEventListener(EDITOR_LIFECYCLE_EVENT, listener);

    const details = listener.mock.calls.map(
      ([event]) => (event as CustomEvent<EditorLifecycleDetail>).detail,
    );
    expect(details.map(({ state }) => state)).toEqual(["activated", "deactivated"]);
    expect(isActive()).toBe(false);
  });

  it("does not let an old returned stop function deactivate a newer activation", () => {
    makeI18n();

    const first = activate({ refreshMessages: false });
    first?.stop();
    const second = activate({ refreshMessages: false });
    first?.stop();

    expect(second).not.toBeNull();
    expect(isActive()).toBe(true);
  });

  it("fails closed when no Comvi i18n is present on the page", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);

    expect(activate({ refreshMessages: false })).toBeNull();

    expect(error).toHaveBeenCalledExactlyOnceWith(
      "[@comvi/plugin-in-context-editor] No Comvi i18n found. Ensure @comvi/core is loaded on the page.",
    );
    expect(isActive()).toBe(false);
  });

  it("fails closed when the requested instance id is not registered", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    makeI18n();

    expect(activate({ instanceId: "missing", refreshMessages: false })).toBeNull();

    expect(error).toHaveBeenCalledExactlyOnceWith(
      "[@comvi/plugin-in-context-editor] No i18n instance found.",
      "Instance ID: missing",
    );
    expect(isActive()).toBe(false);
  });

  it("legacy v1 __COMVI__ registry on the page → the editor starts on its instance's text", async () => {
    const i18n = makeI18n();
    // Old core on the page: `activate()` must migrate `.instances` across
    // rather than reporting "no Comvi i18n found".
    (window as { __COMVI__?: unknown }).__COMVI__ = {
      version: "0.3.0",
      instances: new Map([["primary", i18n]]),
      get: () => i18n,
    };
    const heading = renderMarked("home.title");

    activate({ refreshMessages: false });

    expect(await hoverLabel(heading)).toBe("home.title");
  });

  it("second activate() while one is running → returns null", () => {
    makeI18n();
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    activate({ refreshMessages: false });

    const second = activate({ refreshMessages: false });

    expect(second).toBeNull();
  });

  it("second activate() while one is running → warns to deactivate first", () => {
    makeI18n();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    activate({ refreshMessages: false });

    activate({ refreshMessages: false });

    expect(warn).toHaveBeenCalledExactlyOnceWith(
      "[@comvi/plugin-in-context-editor] Already active. Call deactivate() first.",
    );
  });

  it("second activate() while one is running → the first activation stays the active runtime", () => {
    makeI18n();
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const first = activate({ refreshMessages: false });

    activate({ refreshMessages: false });

    expect(getStatus().instanceId).toBe(first?.instanceId);
  });

  it("reports authoritative runtime status while active and after stopping", () => {
    const i18n = makeI18n();
    (window as { __COMVI__?: unknown }).__COMVI__ = {
      version: "0.3.0",
      instances: new Map([["primary", i18n]]),
      get: () => i18n,
    };

    const first = activate({ refreshMessages: false });

    expect(getStatus()).toEqual({
      active: true,
      instanceId: first?.instanceId,
      comviDetected: true,
      comviVersion: "0.3.0",
      instanceCount: 1,
      hook: null,
    });

    first?.stop();

    expect(getStatus()).toEqual({
      active: false,
      instanceId: null,
      comviDetected: true,
      comviVersion: "0.3.0",
      instanceCount: 1,
      hook: null,
    });
  });

  it("contains lifecycle callback failures and still emits the DOM event", () => {
    makeI18n();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const listener = vi.fn();
    window.addEventListener(EDITOR_LIFECYCLE_EVENT, listener);

    const result = activate({
      refreshMessages: false,
      onLifecycle: () => {
        throw new Error("observer failed");
      },
    });
    result?.stop();
    window.removeEventListener(EDITOR_LIFECYCLE_EVENT, listener);

    expect(listener).toHaveBeenCalledTimes(2);
    expect(warn).toHaveBeenCalledWith(
      "[@comvi/plugin-in-context-editor] Lifecycle callback failed.",
      expect.any(Error),
    );
  });

  it("refreshes translations through the scoped transport without leaking headers", async () => {
    const i18n = makeI18n();
    const addMessages = vi.spyOn(i18n, "addMessages");
    const transport = vi.fn<ApiTransport>(async () => new Response("{}", { status: 200 }));
    fetchApiTranslationsMock.mockImplementation(
      async (
        _apiKey: string,
        _locale: string,
        _namespaces: string[],
        _baseUrl: string,
        _timeout: unknown,
        scopedFetch: typeof fetch,
      ) => {
        const controller = new AbortController();
        await scopedFetch("https://page.invalid/v1/project?locale=en", {
          method: "GET",
          signal: controller.signal,
        });
        await scopedFetch(new URL("https://page.invalid/v1/translations"), { method: "GET" });
        await scopedFetch(new Request("https://page.invalid/v1/keys"), {
          method: "PUT",
          body: JSON.stringify({ key: "hello" }),
          keepalive: true,
        });
        return new Map([["en:default", { hello: "Updated" }]]);
      },
    );

    const result = activate({
      transport,
      apiBaseUrl: "https://api.comvi.io",
      collectContext: false,
    });
    await vi.waitFor(() => expect(addMessages).toHaveBeenCalledTimes(2));

    expect(fetchApiTranslationsMock).toHaveBeenCalledWith(
      "",
      "en",
      ["default"],
      "https://api.comvi.io",
      undefined,
      expect.any(Function),
      result?.instanceId,
      { signal: expect.any(AbortSignal) },
    );
    expect(transport.mock.calls.map(([path]) => path)).toEqual([
      "/v1/project?locale=en",
      "/v1/translations",
      "/v1/keys",
    ]);
    // No `headers` on any proxied call: the transport owner attaches auth
    // outside the page context, so page code must not influence headers.
    expect(transport.mock.calls.map(([, init]) => init)).toEqual([
      { method: "GET", signal: expect.any(AbortSignal) },
      { method: "GET" },
      { method: "PUT", body: JSON.stringify({ key: "hello" }), keepalive: true },
    ]);
    expect(addMessages).toHaveBeenCalledWith({ "en:default": { hello: "Updated" } });
  });

  it("contains a failed translation refresh instead of failing activation", async () => {
    makeI18n();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    fetchApiTranslationsMock.mockRejectedValue(new Error("network down"));

    activate({ apiKey: "test-key" });

    await vi.waitFor(() =>
      expect(warn).toHaveBeenCalledWith(
        "[@comvi/plugin-in-context-editor] Failed to refresh messages from the API.",
        expect.any(Error),
      ),
    );
    expect(isActive()).toBe(true);
  });

  it("deactivate() twice → the second call warns 'Not active.' instead of throwing", () => {
    makeI18n();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    activate({ refreshMessages: false });

    deactivate();
    deactivate();

    expect(warn).toHaveBeenCalledExactlyOnceWith("[@comvi/plugin-in-context-editor] Not active.");
  });
});
