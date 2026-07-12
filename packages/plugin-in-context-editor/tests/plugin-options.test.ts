/**
 * Regression guard for the public opt-outs: both activation entry points
 * (the plugin factory and the standalone `activate`) must hand
 * collectContext/screenGroupResolver through to Core — a dropped option here
 * silently re-enables collection for integrations that opted out.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { createI18n } from "@comvi/core";

const coreCtorMock = vi.fn();
let mockCoreCounter = 0;

vi.mock("../src/Core", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/Core")>();
  return {
    ...actual,
    Core: class MockCore {
      private readonly id = `mock-core-${++mockCoreCounter}`;
      constructor(...args: unknown[]) {
        coreCtorMock(...args);
      }
      start(): void {}
      stop(): void {}
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

describe("collectContext / screenGroupResolver pass-through", () => {
  afterEach(() => {
    coreCtorMock.mockReset();
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
});
