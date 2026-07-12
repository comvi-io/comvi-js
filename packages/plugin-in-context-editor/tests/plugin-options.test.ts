/**
 * Regression guard for the public opt-outs: both activation entry points
 * (the plugin factory and the standalone `activate`) must hand
 * collectContext/screenGroupResolver through to Core — a dropped option here
 * silently re-enables collection for integrations that opted out.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { createI18n } from "@comvi/core";

const coreCtorMock = vi.fn();
const coreStartMock = vi.fn();
const coreStopMock = vi.fn();
const { fetchApiTranslationsMock } = vi.hoisted(() => ({
  fetchApiTranslationsMock: vi.fn(),
}));
let mockCoreCounter = 0;

vi.mock("@comvi/plugin-fetch-loader", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@comvi/plugin-fetch-loader")>();
  return {
    ...actual,
    fetchApiTranslations: fetchApiTranslationsMock,
  };
});

vi.mock("../src/Core", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/Core")>();
  return {
    ...actual,
    Core: class MockCore {
      private readonly id = `mock-core-${++mockCoreCounter}`;
      constructor(...args: unknown[]) {
        coreCtorMock(...args);
      }
      start(): void {
        coreStartMock();
      }
      stop(): void {
        coreStopMock();
      }
      getInstanceId(): string {
        return this.id;
      }
    },
  };
});

import { InContextEditorPlugin } from "../src/index";
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

async function flushAsyncWork(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

describe("collectContext / screenGroupResolver pass-through", () => {
  afterEach(() => {
    coreCtorMock.mockReset();
    coreStartMock.mockReset();
    coreStopMock.mockReset();
    fetchApiTranslationsMock.mockReset();
    if (isActive()) {
      deactivate();
    }
    delete (window as { __COMVI__?: unknown }).__COMVI__;
  });

  it("InContextEditorPlugin hands collectContext: false and the resolver to Core", () => {
    const resolver = () => "/users/:id";
    const i18n = makeI18n();
    const cleanup = InContextEditorPlugin({ collectContext: false, screenGroupResolver: resolver })(
      i18n,
    );

    const options = lastCoreOptions();
    expect(options.collectContext).toBe(false);
    expect(options.screenGroupResolver).toBe(resolver);

    cleanup?.();
  });

  it("InContextEditorPlugin leaves collectContext undefined (Core's default: enabled) when not set", () => {
    const i18n = makeI18n();
    const cleanup = InContextEditorPlugin()(i18n);

    expect(lastCoreOptions().collectContext).toBeUndefined();

    cleanup?.();
  });

  it("standalone activate() hands collectContext: false and the resolver to Core", () => {
    const resolver = () => "/checkout";
    const i18n = makeI18n();
    (window as { __COMVI__?: unknown }).__COMVI__ = { get: () => i18n };

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
    const i18n = createI18n({
      locale: "en",
      defaultNs: "default",
      translation: { "en:default": { hello: "Hello" } },
      collectContext: false,
    });
    (window as { __COMVI__?: unknown }).__COMVI__ = { get: () => i18n };

    const result = activate({ collectContext: true, refreshTranslations: false });

    expect(result?.collectContext).toBe(false);
    expect(lastCoreOptions().collectContext).toBe(false);
  });
});

describe("standalone lifecycle notifications", () => {
  afterEach(() => {
    if (isActive()) {
      deactivate();
    }
    delete (window as { __COMVI__?: unknown }).__COMVI__;
    coreStartMock.mockReset();
    coreStopMock.mockReset();
    fetchApiTranslationsMock.mockReset();
  });

  it("notifies callback and DOM observers when the returned stop function deactivates", () => {
    const i18n = makeI18n();
    (window as { __COMVI__?: unknown }).__COMVI__ = { get: () => i18n };
    const callback = vi.fn<(detail: EditorLifecycleDetail) => void>();
    const eventDetails: EditorLifecycleDetail[] = [];
    const listener = (event: Event) => {
      eventDetails.push((event as CustomEvent<EditorLifecycleDetail>).detail);
    };
    window.addEventListener(EDITOR_LIFECYCLE_EVENT, listener);

    const result = activate({
      apiKey: "must-not-appear-in-lifecycle",
      refreshTranslations: false,
      onLifecycle: callback,
    });
    expect(result).not.toBeNull();
    result?.stop();
    window.removeEventListener(EDITOR_LIFECYCLE_EVENT, listener);

    expect(callback.mock.calls.map(([detail]) => detail.state)).toEqual([
      "activated",
      "deactivated",
    ]);
    expect(eventDetails.map(({ state }) => state)).toEqual(["activated", "deactivated"]);
    expect(JSON.stringify(eventDetails)).not.toContain("must-not-appear-in-lifecycle");
    expect(isActive()).toBe(false);
  });

  it("notifies observers when the global deactivate entry point is called", () => {
    const i18n = makeI18n();
    (window as { __COMVI__?: unknown }).__COMVI__ = { get: () => i18n };
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
    const i18n = makeI18n();
    (window as { __COMVI__?: unknown }).__COMVI__ = { get: () => i18n };

    const first = activate({ refreshTranslations: false });
    first?.stop();
    const second = activate({ refreshTranslations: false });
    first?.stop();

    expect(second).not.toBeNull();
    expect(isActive()).toBe(true);
  });

  it("fails closed when Comvi or the requested instance is unavailable", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);

    expect(activate({ refreshTranslations: false })).toBeNull();

    (window as { __COMVI__?: unknown }).__COMVI__ = { get: () => undefined };
    expect(activate({ instanceId: "missing", refreshTranslations: false })).toBeNull();

    expect(error).toHaveBeenCalledTimes(2);
    expect(isActive()).toBe(false);
    error.mockRestore();
  });

  it("rejects a second activation and reports authoritative runtime status", () => {
    const i18n = makeI18n();
    (window as { __COMVI__?: unknown }).__COMVI__ = {
      version: "0.3.0",
      instances: new Map([["primary", i18n]]),
      get: () => i18n,
    };
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    const first = activate({ refreshTranslations: false });
    expect(activate({ refreshTranslations: false })).toBeNull();
    expect(getStatus()).toEqual({
      active: true,
      instanceId: first?.instanceId,
      comviDetected: true,
      comviVersion: "0.3.0",
      instanceCount: 1,
    });

    first?.stop();
    expect(getStatus().active).toBe(false);
    expect(warn).toHaveBeenCalledWith(
      "[ComviInContextEditor] Already active. Call deactivate() first.",
    );
    warn.mockRestore();
  });

  it("contains lifecycle callback failures and still emits the DOM event", () => {
    const i18n = makeI18n();
    (window as { __COMVI__?: unknown }).__COMVI__ = { get: () => i18n };
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
    warn.mockRestore();
  });

  it("refreshes translations through the scoped transport without leaking headers", async () => {
    const i18n = makeI18n();
    const addTranslations = vi.spyOn(i18n, "addTranslations");
    (window as { __COMVI__?: unknown }).__COMVI__ = { get: () => i18n };
    const transport = vi.fn(async () => new Response("{}", { status: 200 }));
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
    await flushAsyncWork();

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
    expect(transport.mock.calls.every(([, init]) => !("headers" in (init ?? {})))).toBe(true);
    expect(addTranslations).toHaveBeenCalledWith({ "en:default": { hello: "Updated" } });
    expect(addTranslations).toHaveBeenCalledTimes(2);
  });

  it("contains refresh failures and permits idempotent deactivation", async () => {
    const i18n = makeI18n();
    (window as { __COMVI__?: unknown }).__COMVI__ = { get: () => i18n };
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    fetchApiTranslationsMock.mockRejectedValue(new Error("network down"));

    activate({ apiKey: "test-key" });
    await flushAsyncWork();
    deactivate();
    deactivate();

    expect(warn).toHaveBeenCalledWith(
      "[ComviInContextEditor] Failed to refresh translations from API.",
      expect.any(Error),
    );
    expect(warn).toHaveBeenCalledWith("[ComviInContextEditor] Not active.");
    warn.mockRestore();
  });
});
