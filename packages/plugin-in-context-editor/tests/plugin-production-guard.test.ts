/**
 * Production runtime guard for the FULL entry (src/index.ts).
 *
 * Bundlers that ignore the "production" export condition still resolve the
 * full development entry; the factory must then return a no-op plugin under
 * NODE_ENV=production so the editor runtime never activates in prod builds.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { asPluginHost, createI18n } from "./helpers/composedHost";

const { coreCtorMock, coreStartMock, coreStopMock, mockCoreModule, resetCoreMocks } =
  await vi.hoisted(() => import("./helpers/mockCore"));

vi.mock("../src/Core", mockCoreModule);

import { InContextEditorPlugin } from "../src/index";

const MAPPINGS_BRIDGE_KEY = "__comviInContextEditorMappings";

function makeI18n() {
  return createI18n({
    locale: "en",
    defaultNs: "default",
    translation: { "en:default": { hello: "Hello" } },
  });
}

describe("InContextEditorPlugin production guard", () => {
  afterEach(() => {
    resetCoreMocks();
  });

  it("returns a noop plugin under NODE_ENV=production: no editor activation, no i18n mutation", () => {
    vi.stubEnv("NODE_ENV", "production");
    const i18n = makeI18n();
    // Subscribing to i18n events IS how the real plugin mutates the host, so
    // "no subscriptions" is the observable form of "the host is untouched".
    const onSpy = vi.spyOn(i18n, "on");

    const cleanup = InContextEditorPlugin()(asPluginHost(i18n));

    expect(coreCtorMock).not.toHaveBeenCalled();
    expect(coreStartMock).not.toHaveBeenCalled();
    expect((i18n as unknown as Record<string, unknown>)[MAPPINGS_BRIDGE_KEY]).toBeUndefined();
    expect(onSpy).not.toHaveBeenCalled();
    // Interface mirrors the real plugin: a callable cleanup that is a no-op.
    expect(typeof cleanup).toBe("function");
    expect(() => (cleanup as () => void)()).not.toThrow();
    expect(coreStopMock).not.toHaveBeenCalled();
  });

  it("guard applies even when factory options are provided", () => {
    vi.stubEnv("NODE_ENV", "production");
    const i18n = makeI18n();

    const cleanup = InContextEditorPlugin({ debug: true, collectContext: false })(
      asPluginHost(i18n),
    );

    expect(coreCtorMock).not.toHaveBeenCalled();
    expect(typeof cleanup).toBe("function");
    expect(() => (cleanup as () => void)()).not.toThrow();
  });

  it("activates the real editor runtime when NODE_ENV is development", () => {
    vi.stubEnv("NODE_ENV", "development");
    const i18n = makeI18n();

    const cleanup = InContextEditorPlugin()(asPluginHost(i18n));

    expect(coreCtorMock).toHaveBeenCalledTimes(1);
    expect(coreStartMock).toHaveBeenCalledTimes(1);
    expect((i18n as unknown as Record<string, unknown>)[MAPPINGS_BRIDGE_KEY]).toBeDefined();

    (cleanup as () => void)?.();
    expect(coreStopMock).toHaveBeenCalledTimes(1);
  });

  it("activates the real editor runtime when NODE_ENV is unset (the bundler case)", () => {
    vi.stubEnv("NODE_ENV", undefined);
    const i18n = makeI18n();

    const cleanup = InContextEditorPlugin()(asPluginHost(i18n));

    expect(coreCtorMock).toHaveBeenCalledTimes(1);
    expect(coreStartMock).toHaveBeenCalledTimes(1);

    (cleanup as () => void)?.();
    expect(coreStopMock).toHaveBeenCalledTimes(1);
  });
});
