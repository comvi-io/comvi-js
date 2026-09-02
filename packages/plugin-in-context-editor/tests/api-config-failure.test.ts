/**
 * What both activation entry points owe the page when the API configuration
 * module itself fails: a started Core must never outlive a failed startup, and
 * a teardown must run to the end and surface the FIRST failure.
 *
 * `initApiConfig`/`resetApiConfig` cannot be made to fail through their own
 * inputs, so the config module is the seam — the collaborator boundary, not an
 * internal of the code under test.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { asPluginHost, createI18n, type ComposedHost } from "./helpers/composedHost";

const { coreStopMock, mockCoreModule, resetCoreMocks } = await vi.hoisted(
  () => import("./helpers/mockCore"),
);

const { initApiConfigMock, resetApiConfigMock } = vi.hoisted(() => ({
  initApiConfigMock: vi.fn(),
  resetApiConfigMock: vi.fn(),
}));

vi.mock("../src/config/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/config/api")>();
  return { ...actual, initApiConfig: initApiConfigMock, resetApiConfig: resetApiConfigMock };
});

vi.mock("../src/Core", mockCoreModule);

import { InContextEditorPlugin } from "../src/index";
import { activate, deactivate, isActive } from "../src/standalone";
import { resetEncoder } from "../src/translation";

function makeI18n(): ComposedHost {
  return createI18n({
    locale: "en",
    defaultNs: "default",
    translation: { "en:default": { hello: "Hello" } },
  });
}

function failWith(mock: ReturnType<typeof vi.fn>, message: string): void {
  mock.mockImplementation(() => {
    throw new Error(message);
  });
}

afterEach(() => {
  initApiConfigMock.mockReset();
  resetApiConfigMock.mockReset();
  if (isActive()) {
    deactivate();
  }
  delete (window as { __COMVI__?: unknown }).__COMVI__;
  resetCoreMocks();
  resetEncoder();
});

describe("InContextEditorPlugin startup failure", () => {
  it("stops the editor Core and rethrows when the API configuration cannot be initialized", () => {
    const i18n = makeI18n();
    failWith(initApiConfigMock, "bad config");

    expect(() => InContextEditorPlugin()(asPluginHost(i18n))).toThrow("bad config");

    expect(coreStopMock).toHaveBeenCalledTimes(1);
  });
});

describe("activate() startup failure", () => {
  it("stops the editor Core, stays inactive and rethrows when the API configuration cannot be initialized", () => {
    makeI18n();
    failWith(initApiConfigMock, "bad config");

    expect(() => activate({ refreshTranslations: false })).toThrow("bad config");

    expect(coreStopMock).toHaveBeenCalledTimes(1);
    expect(isActive()).toBe(false);
  });
});

describe("deactivate() teardown failure", () => {
  it("rethrows an API-config reset failure that is the only thing to go wrong", () => {
    makeI18n();
    const result = activate({ refreshTranslations: false });
    failWith(resetApiConfigMock, "reset boom");

    expect(() => result?.stop()).toThrow("reset boom");
  });

  it("surfaces the FIRST failure when both the Core stop and the API reset fail", () => {
    makeI18n();
    const result = activate({ refreshTranslations: false });
    failWith(coreStopMock, "core boom");
    failWith(resetApiConfigMock, "reset boom");

    expect(() => result?.stop()).toThrow("core boom");
  });
});
