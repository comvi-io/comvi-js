/**
 * Production runtime guard for the FULL entry (src/index.ts).
 *
 * Bundlers that ignore the "production" export condition still resolve the
 * full development entry; the factory must then return a no-op plugin under
 * NODE_ENV=production so the editor runtime never activates in prod builds.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { createI18n } from "./helpers/composedHost";
import type * as CoreModule from "../src/Core";

const coreCtorMock = vi.fn();
const coreStartMock = vi.fn();
const coreStopMock = vi.fn();
let mockCoreCounter = 0;

vi.mock("../src/Core", async (importOriginal) => {
  const actual = await importOriginal<typeof CoreModule>();
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
    vi.unstubAllEnvs();
    coreCtorMock.mockReset();
    coreStartMock.mockReset();
    coreStopMock.mockReset();
  });

  it("returns a noop plugin under NODE_ENV=production: no editor activation, no i18n mutation", () => {
    vi.stubEnv("NODE_ENV", "production");
    const i18n = makeI18n();
    const onSpy = vi.spyOn(i18n, "on");

    const cleanup = InContextEditorPlugin()(i18n);

    // No editor core constructed or started.
    expect(coreCtorMock).not.toHaveBeenCalled();
    expect(coreStartMock).not.toHaveBeenCalled();
    // No mappings bridge attached, no event subscriptions.
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

    const cleanup = InContextEditorPlugin({ debug: true, collectContext: false })(i18n);

    expect(coreCtorMock).not.toHaveBeenCalled();
    expect(typeof cleanup).toBe("function");
    (cleanup as () => void)();
  });

  it("activates the real editor runtime when NODE_ENV is not production", () => {
    const i18n = makeI18n();

    const cleanup = InContextEditorPlugin()(i18n);

    expect(coreCtorMock).toHaveBeenCalledTimes(1);
    expect(coreStartMock).toHaveBeenCalledTimes(1);
    expect((i18n as unknown as Record<string, unknown>)[MAPPINGS_BRIDGE_KEY]).toBeDefined();

    (cleanup as () => void)?.();
    expect(coreStopMock).toHaveBeenCalledTimes(1);
  });
});
