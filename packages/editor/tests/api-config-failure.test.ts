/**
 * What `activate()` owes the page when the API configuration module itself fails: a constructed Core must never outlive a failed startup,
 * and a teardown must run to the end and surface the FIRST failure.
 *
 * `initApiConfig`/`resetApiConfig` cannot be made to fail through their own
 * inputs, so the config module is the seam — the collaborator boundary, not an
 * internal of the code under test. The Core is real. A Core that was built but
 * never stopped leaves its session registered for the editor UI, which reads it
 * through `getSession()`, and its instance marked; both are what these tests observe.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import type { I18n } from "@comvi/core";
import { pageInstance } from "./helpers/session";

const { initApiConfigMock, resetApiConfigMock } = vi.hoisted(() => ({
  initApiConfigMock: vi.fn(),
  resetApiConfigMock: vi.fn(),
}));

vi.mock("../src/config/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/config/api")>();
  return { ...actual, initApiConfig: initApiConfigMock, resetApiConfig: resetApiConfigMock };
});

import { Core, getSession } from "../src/Core";
import { activate, deactivate, isActive } from "../src/standalone";

let page: I18n | undefined;
function makeI18n(): I18n {
  return (page = pageInstance({ messages: { en: { hello: "Hello" } } }));
}

/**
 * Fault injection: `Core.stop()` finishes its real teardown, so nothing leaks
 * into later tests, and then throws.
 */
function failCoreStopWith(message: string): void {
  const realStop = Core.prototype.stop;
  vi.spyOn(Core.prototype, "stop").mockImplementation(function (this: Core) {
    realStop.call(this);
    throw new Error(message);
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
  page?.destroy();
  page = undefined;
  delete (window as { __COMVI__?: unknown }).__COMVI__;
});

describe("activate() startup failure", () => {
  it("initApiConfig throws → activate() rethrows the failure", () => {
    makeI18n();
    failWith(initApiConfigMock, "bad config");

    expect(() => activate({ refreshMessages: false })).toThrow("bad config");
  });

  it("initApiConfig throws → the runtime stays inactive", () => {
    makeI18n();
    failWith(initApiConfigMock, "bad config");

    expect(() => activate({ refreshMessages: false })).toThrow("bad config");

    expect(isActive()).toBe(false);
  });

  it("initApiConfig throws → no session is left registered and the instance renders unmarked", () => {
    const i18n = makeI18n();
    failWith(initApiConfigMock, "bad config");

    expect(() => activate({ refreshMessages: false })).toThrow("bad config");

    expect({ session: getSession(), text: i18n.t("hello") }).toEqual({
      session: null,
      text: "Hello",
    });
  });
});

describe("deactivate() teardown failure", () => {
  it("resetApiConfig throws, nothing else fails → deactivation rethrows the reset failure", () => {
    makeI18n();
    const result = activate({ refreshMessages: false });
    failWith(resetApiConfigMock, "reset boom");

    expect(() => (result.ok ? result.stop() : undefined)).toThrow("reset boom");
  });

  it("Core.stop() and resetApiConfig both throw → deactivation surfaces the FIRST failure", () => {
    makeI18n();
    const result = activate({ refreshMessages: false });
    failCoreStopWith("core boom");
    failWith(resetApiConfigMock, "reset boom");

    expect(() => (result.ok ? result.stop() : undefined)).toThrow("core boom");
  });
});
