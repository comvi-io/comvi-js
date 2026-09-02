/**
 * The plugin host's PRODUCTION diagnostics.
 *
 * The dev build explains each misuse at length; production ships the bare
 * `E_*` code, which is what a consumer's error handling can key on. A required
 * plugin's failure still reaches `init()`'s caller AND `onError`, so both
 * surfaces are asserted with the exact code.
 */
import { describe, it, expect, vi } from "vitest";
import { createI18n } from "../../src";
import { attachPlugins, ensureInstallable } from "../../src/plugins";

function makeHost(onError?: (error: Error, context?: unknown) => void) {
  return attachPlugins(createI18n({ locale: "en", ns: [], exposeGlobal: false, onError }));
}

describe("registerLocaleDetector()", () => {
  it("throws the bare E_REGISTER_LOCALE_DETECTOR code for a non-function argument", () => {
    const i18n = makeHost();

    expect(() => i18n.registerLocaleDetector("uk" as never)).toThrowError(
      expect.objectContaining({ message: "E_REGISTER_LOCALE_DETECTOR" }),
    );
  });
});

describe("registerPostProcessor()", () => {
  it("throws the bare E_REGISTER_POST_PROCESSOR code for a non-function argument", () => {
    const i18n = makeHost();

    expect(() => i18n.registerPostProcessor(42 as never)).toThrowError(
      expect.objectContaining({ message: "E_REGISTER_POST_PROCESSOR" }),
    );
  });
});

describe("plugin initialization", () => {
  it("fails a plugin that returns a value with the bare E_PLUGIN_INIT_RETURN code", async () => {
    const onError = vi.fn();
    const i18n = makeHost(onError);
    i18n.use(() => ({ notACleanup: true }) as never);

    await expect(i18n.init()).rejects.toThrowError(
      expect.objectContaining({ message: "E_PLUGIN_INIT_RETURN" }),
    );

    expect(onError).toHaveBeenCalledWith(
      expect.objectContaining({ message: "E_PLUGIN_INIT_RETURN" }),
      expect.objectContaining({ source: "plugin" }),
    );
  });

  it("fails a plugin that outruns its timeout with the bare E_PLUGIN_INIT_TIMEOUT code", async () => {
    const i18n = makeHost();
    i18n.use(() => new Promise<void>(() => {}), { timeout: 1 });

    await expect(i18n.init()).rejects.toThrowError(
      expect.objectContaining({ message: "E_PLUGIN_INIT_TIMEOUT" }),
    );
  });

  it("wraps a plugin's non-Error throw in the bare E_PLUGIN_INIT_FAILED code", async () => {
    const i18n = makeHost();
    i18n.use(() => {
      throw "boom";
    });

    await expect(i18n.init()).rejects.toThrowError(
      expect.objectContaining({ message: "E_PLUGIN_INIT_FAILED" }),
    );
  });

  it("keeps a plugin's own Error untouched — only a non-Error throw gets a code", async () => {
    const i18n = makeHost();
    i18n.use(() => {
      throw new Error("the plugin's own words");
    });

    await expect(i18n.init()).rejects.toThrowError(
      expect.objectContaining({ message: "the plugin's own words" }),
    );
  });
});

describe("ensureInstallable()", () => {
  it("rejects an installer run as a plugin with the bare E_INSTALLER_NESTED_USE code", async () => {
    const i18n = makeHost();
    i18n.use((host) => void ensureInstallable(host, "fetchLoader"));

    await expect(i18n.init()).rejects.toThrowError(
      expect.objectContaining({ message: "E_INSTALLER_NESTED_USE" }),
    );
  });

  it("hands the host back untouched outside plugin initialization", () => {
    const i18n = makeHost();

    expect(ensureInstallable(i18n, "fetchLoader")).toBe(i18n);
  });
});
