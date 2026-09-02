/**
 * Regression guard for the public opt-outs: both activation entry points
 * (the plugin factory and the standalone `activate`) must hand
 * collectContext/screenGroupResolver through to Core — a dropped option here
 * silently re-enables collection for integrations that opted out.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { asPluginHost, createI18n } from "./helpers/composedHost";

const {
  coreCtorMock,
  coreStartMock,
  coreStopMock,
  mockCoreModule,
  resetCoreMocks,
  FIRST_MOCK_CORE_ID,
} = await vi.hoisted(() => import("./helpers/mockCore"));

const { fetchApiTranslationsMock } = vi.hoisted(() => ({
  fetchApiTranslationsMock: vi.fn(),
}));

vi.mock("@comvi/plugin-fetch-loader", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@comvi/plugin-fetch-loader")>();
  return {
    ...actual,
    fetchApiTranslations: fetchApiTranslationsMock,
  };
});

vi.mock("../src/Core", mockCoreModule);

import { InContextEditorPlugin } from "../src/index";
import type { ApiTransport } from "../src/config/api";
import {
  activate,
  deactivate,
  EDITOR_LIFECYCLE_EVENT,
  getStatus,
  isActive,
  type EditorLifecycleDetail,
} from "../src/standalone";

type CoreOptions = {
  collectContext?: boolean;
  screenGroupResolver?: () => string | null | undefined;
};

function lastCoreOptions(): CoreOptions {
  expect(coreCtorMock).toHaveBeenCalled();
  return coreCtorMock.mock.calls[coreCtorMock.mock.calls.length - 1]![0] as CoreOptions;
}

function makeI18n() {
  return createI18n({
    locale: "en",
    defaultNs: "default",
    translation: { "en:default": { hello: "Hello" } },
  });
}

function resetStandaloneRuntime(): void {
  if (isActive()) {
    deactivate();
  }
  delete (window as { __COMVI__?: unknown }).__COMVI__;
  resetCoreMocks();
  fetchApiTranslationsMock.mockReset();
}

describe("collectContext / screenGroupResolver pass-through", () => {
  afterEach(resetStandaloneRuntime);

  it("InContextEditorPlugin hands collectContext: false and the resolver to Core", () => {
    const resolver = () => "/users/:id";
    const i18n = makeI18n();
    // The editor's install is synchronous and always hands back its teardown;
    // `I18nPlugin`'s return type also covers the async and no-cleanup shapes.
    const cleanup = InContextEditorPlugin({ collectContext: false, screenGroupResolver: resolver })(
      asPluginHost(i18n),
    ) as () => void;

    const options = lastCoreOptions();
    expect(options.collectContext).toBe(false);
    expect(options.screenGroupResolver).toBe(resolver);

    cleanup?.();
  });

  it("InContextEditorPlugin leaves collectContext undefined (Core's default: enabled) when not set", () => {
    const i18n = makeI18n();
    const cleanup = InContextEditorPlugin()(asPluginHost(i18n)) as () => void;

    expect(lastCoreOptions().collectContext).toBeUndefined();

    cleanup?.();
  });

  it("standalone activate() hands collectContext: false and the resolver to Core", () => {
    const resolver = () => "/checkout";
    // makeI18n() self-announces on the __COMVI__ queue (exposeGlobal default)
    makeI18n();

    const result = activate({
      collectContext: false,
      screenGroupResolver: resolver,
      refreshTranslations: false,
    });
    expect(result).not.toBeNull();

    const options = lastCoreOptions();
    expect(options.collectContext).toBe(false);
    expect(options.screenGroupResolver).toBe(resolver);
    expect(result?.collectContext).toBe(false);
  });

  it("standalone activation reports the effective site-narrowed collectContext value", () => {
    createI18n({
      locale: "en",
      defaultNs: "default",
      translation: { "en:default": { hello: "Hello" } },
      collectContext: false,
    });

    const result = activate({ collectContext: true, refreshTranslations: false });

    expect(result?.collectContext).toBe(false);
    expect(lastCoreOptions().collectContext).toBe(false);
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

    const result = activate({ refreshTranslations: false, onLifecycle: callback });
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
      refreshTranslations: false,
    });
    result?.stop();
    window.removeEventListener(EDITOR_LIFECYCLE_EVENT, listener);

    expect(eventDetails).toEqual([
      { state: "activated", instanceId: FIRST_MOCK_CORE_ID },
      { state: "deactivated", instanceId: FIRST_MOCK_CORE_ID },
    ]);
  });

  it("notifies observers when the global deactivate entry point is called", () => {
    makeI18n();
    const listener = vi.fn();
    window.addEventListener(EDITOR_LIFECYCLE_EVENT, listener);

    activate({ refreshTranslations: false });
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

    const first = activate({ refreshTranslations: false });
    first?.stop();
    const second = activate({ refreshTranslations: false });
    first?.stop();

    expect(second).not.toBeNull();
    expect(isActive()).toBe(true);
  });

  it("fails closed when no Comvi i18n is present on the page", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);

    expect(activate({ refreshTranslations: false })).toBeNull();

    expect(error).toHaveBeenCalledExactlyOnceWith(
      "[ComviInContextEditor] No Comvi i18n found. Ensure @comvi/core is loaded on the page.",
    );
    expect(isActive()).toBe(false);
  });

  it("fails closed when the requested instance id is not registered", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    makeI18n();

    expect(activate({ instanceId: "missing", refreshTranslations: false })).toBeNull();

    expect(error).toHaveBeenCalledExactlyOnceWith(
      "[ComviInContextEditor] No i18n instance found.",
      "Instance ID: missing",
    );
    expect(isActive()).toBe(false);
  });

  it("drains a legacy v1 __COMVI__ registry into the dual-protocol hook", () => {
    const i18n = makeI18n();
    // Old core on the page: `activate()` must migrate `.instances` across
    // rather than reporting "no Comvi i18n found".
    (window as { __COMVI__?: unknown }).__COMVI__ = {
      version: "0.3.0",
      instances: new Map([["primary", i18n]]),
      get: () => i18n,
    };

    const result = activate({ refreshTranslations: false });

    expect(result).not.toBeNull();
    expect(coreStartMock).toHaveBeenCalledTimes(1);
  });

  it("rejects a second activation while one is already running", () => {
    makeI18n();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    activate({ refreshTranslations: false });

    expect(activate({ refreshTranslations: false })).toBeNull();
    expect(warn).toHaveBeenCalledExactlyOnceWith(
      "[ComviInContextEditor] Already active. Call deactivate() first.",
    );
    expect(coreStartMock).toHaveBeenCalledTimes(1);
  });

  it("reports authoritative runtime status while active and after stopping", () => {
    const i18n = makeI18n();
    (window as { __COMVI__?: unknown }).__COMVI__ = {
      version: "0.3.0",
      instances: new Map([["primary", i18n]]),
      get: () => i18n,
    };

    const first = activate({ refreshTranslations: false });

    expect(getStatus()).toEqual({
      active: true,
      instanceId: FIRST_MOCK_CORE_ID,
      comviDetected: true,
      comviVersion: "0.3.0",
      instanceCount: 1,
    });

    first?.stop();

    expect(getStatus()).toEqual({
      active: false,
      instanceId: null,
      comviDetected: true,
      comviVersion: "0.3.0",
      instanceCount: 1,
    });
  });

  it("contains lifecycle callback failures and still emits the DOM event", () => {
    makeI18n();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const listener = vi.fn();
    window.addEventListener(EDITOR_LIFECYCLE_EVENT, listener);

    const result = activate({
      refreshTranslations: false,
      onLifecycle: () => {
        throw new Error("observer failed");
      },
    });
    result?.stop();
    window.removeEventListener(EDITOR_LIFECYCLE_EVENT, listener);

    expect(listener).toHaveBeenCalledTimes(2);
    expect(warn).toHaveBeenCalledWith(
      "[ComviInContextEditor] Lifecycle callback failed.",
      expect.any(Error),
    );
  });

  it("refreshes translations through the scoped transport without leaking headers", async () => {
    const i18n = makeI18n();
    const addTranslations = vi.spyOn(i18n, "addTranslations");
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
    await vi.waitFor(() => expect(addTranslations).toHaveBeenCalledTimes(2));

    expect(fetchApiTranslationsMock).toHaveBeenCalledWith(
      "",
      "en",
      ["default"],
      "https://api.comvi.io",
      undefined,
      expect.any(Function),
      result?.instanceId,
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
    expect(addTranslations).toHaveBeenCalledWith({ "en:default": { hello: "Updated" } });
  });

  it("contains a failed translation refresh instead of failing activation", async () => {
    makeI18n();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    fetchApiTranslationsMock.mockRejectedValue(new Error("network down"));

    activate({ apiKey: "test-key" });

    await vi.waitFor(() =>
      expect(warn).toHaveBeenCalledWith(
        "[ComviInContextEditor] Failed to refresh translations from API.",
        expect.any(Error),
      ),
    );
    expect(isActive()).toBe(true);
  });

  it("warns instead of throwing when deactivate() is called twice", () => {
    makeI18n();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    activate({ refreshTranslations: false });

    deactivate();
    deactivate();

    expect(warn).toHaveBeenCalledExactlyOnceWith("[ComviInContextEditor] Not active.");
    expect(coreStopMock).toHaveBeenCalledTimes(1);
  });
});
