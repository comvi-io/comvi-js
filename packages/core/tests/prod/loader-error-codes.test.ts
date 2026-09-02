/**
 * The loader capability's PRODUCTION diagnostics.
 *
 * Every message the development build spends on guidance collapses to a bare
 * `E_*` code here, and that code is the entire contract a production consumer
 * can match on — so each one is asserted as an EXACT message rather than a
 * substring, and the reported error is checked alongside the thrown one
 * wherever the two differ.
 */
import { describe, it, expect, vi } from "vitest";
import { createI18n } from "../../src";
import { attachLoader, createImportMapLoader } from "../../src/loader";

function makeHost(onError?: (error: Error, context?: unknown) => void) {
  return attachLoader(createI18n({ locale: "en", ns: [], exposeGlobal: false, onError }));
}

describe("registerLoader()", () => {
  it("throws the bare E_REGISTER_LOADER_ARG code for a non-function argument", () => {
    const i18n = makeHost();

    expect(() => i18n.registerLoader({} as never)).toThrowError(
      expect.objectContaining({ message: "E_REGISTER_LOADER_ARG" }),
    );
  });
});

describe("reloadTranslations()", () => {
  it("rejects with the bare E_NO_LOADER_REGISTERED code when nothing was registered", async () => {
    const i18n = makeHost();

    await expect(i18n.reloadTranslations()).rejects.toThrowError(
      expect.objectContaining({ message: "E_NO_LOADER_REGISTERED" }),
    );
  });

  it("rejects and reports the bare E_FAILED_RELOAD_TRANSLATIONS code when every refetch fails", async () => {
    const onError = vi.fn();
    const i18n = makeHost(onError);
    i18n.registerLoader(async () => {
      throw new Error("network down");
    });
    i18n.addTranslations({ "en:x": { key: "cached" } });

    await expect(i18n.reloadTranslations()).rejects.toThrowError(
      expect.objectContaining({ message: "E_FAILED_RELOAD_TRANSLATIONS" }),
    );

    expect(onError).toHaveBeenLastCalledWith(
      expect.objectContaining({ message: "E_FAILED_RELOAD_TRANSLATIONS" }),
      { source: "namespace-load" },
    );
  });
});

describe("namespace-load failures", () => {
  it("rejects with the bare E_ALL_NAMESPACES_FAILED code when the whole locale fails", async () => {
    const onError = vi.fn();
    const i18n = makeHost(onError);
    i18n.registerLoader(async () => {
      throw new Error("network down");
    });

    const activation = i18n.addActiveNamespaces(["a", "b"]);

    await expect(activation).rejects.toBeInstanceOf(Error);
    await expect(activation).rejects.toThrowError(
      expect.objectContaining({ message: "E_ALL_NAMESPACES_FAILED" }),
    );
    expect(onError).toHaveBeenLastCalledWith(
      expect.objectContaining({ message: "E_ALL_NAMESPACES_FAILED" }),
      { source: "namespace-load", locale: "en", namespace: "a, b" },
    );
  });

  it("reports the bare E_PARTIAL_NAMESPACE_LOAD code when only some namespaces fail", async () => {
    const onError = vi.fn();
    const i18n = makeHost(onError);
    i18n.registerLoader(async (_locale, namespace) => {
      if (namespace === "bad") throw new Error("network down");
      return { key: `${namespace}-value` };
    });

    await i18n.addActiveNamespaces(["good", "bad"]);

    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledWith(
      expect.objectContaining({ message: "E_PARTIAL_NAMESPACE_LOAD" }),
      { source: "namespace-load", locale: "en", namespace: "bad" },
    );
  });
});

describe("createImportMapLoader()", () => {
  it("rejects with the bare E_REGISTER_LOADER_ENTRY code for a locale the map has no entry for", async () => {
    const load = createImportMapLoader({ en: async () => ({ hi: "Hi" }) }, () => "default");

    await expect(load("de", "default")).rejects.toThrowError(
      expect.objectContaining({ message: "E_REGISTER_LOADER_ENTRY" }),
    );
  });
});
