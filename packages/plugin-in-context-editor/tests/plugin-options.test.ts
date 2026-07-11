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
import { activate, deactivate, isActive } from "../src/standalone";

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
  });
});
