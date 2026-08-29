/**
 * What a namespace-load failure REPORTS, and what a reload leaves behind.
 *
 * `reloadTranslations` documents that a total failure may leave the cache
 * empty — it clears the scope BEFORE refetching, so a failed refetch is
 * observable as missing translations rather than as silently stale ones. The
 * error reports are the other half: `onError` receives one message per failure
 * shape (partial vs. total) and a context naming the locale and the namespaces
 * that failed, which is all a consumer has to act on.
 */
import { describe, it, expect, vi } from "vitest";
import { createI18n } from "../../src";
import { attachLoader } from "../../src/loader";

function makeHost(onError?: (error: Error, context?: unknown) => void) {
  return attachLoader(createI18n({ locale: "en", ns: [], onError }));
}

describe("reloadTranslations()", () => {
  it("leaves the reloaded scope empty when the refetch fails", async () => {
    let attempt = 0;
    const i18n = makeHost();
    i18n.registerLoader(async () => {
      attempt++;
      if (attempt === 1) return { key: "first" };
      throw new Error("network down");
    });
    await i18n.addActiveNamespace("x");

    await expect(i18n.reloadTranslations()).rejects.toThrow(/Failed to reload translations/);

    expect(i18n.t("key", { ns: "x" })).toBe("key");
  });

  it("reports the total reload failure under the namespace-load source", async () => {
    const onError = vi.fn();
    const i18n = makeHost(onError);
    i18n.registerLoader(async () => {
      throw new Error("network down");
    });
    i18n.addTranslations({ "en:x": { key: "cached" } });

    await expect(i18n.reloadTranslations()).rejects.toThrow(/Failed to reload translations/);

    expect(onError).toHaveBeenLastCalledWith(
      expect.objectContaining({ message: "[i18n] Failed to reload translations" }),
      { source: "namespace-load" },
    );
  });
});

describe("namespace-load error reports", () => {
  it("names every failed namespace when the whole locale fails", async () => {
    const onError = vi.fn();
    const i18n = makeHost(onError);
    i18n.registerLoader(async () => {
      throw new Error("network down");
    });

    const activation = i18n.addActiveNamespaces(["a", "b"]);

    // `rejects.toThrow(message)` alone also passes for a promise that rejects
    // with `undefined`, so the rejection value is asserted first.
    await expect(activation).rejects.toBeInstanceOf(Error);
    await expect(activation).rejects.toThrow(
      '[i18n] Failed to load all namespaces for locale "en": a, b',
    );
    expect(onError).toHaveBeenLastCalledWith(
      expect.objectContaining({
        message: '[i18n] Failed to load all namespaces for locale "en": a, b',
      }),
      { source: "namespace-load", locale: "en", namespace: "a, b" },
    );
  });

  it("counts the failures against the attempted namespaces when only some fail", async () => {
    const onError = vi.fn();
    const i18n = makeHost(onError);
    i18n.registerLoader(async (_locale, namespace) => {
      if (namespace === "bad") throw new Error("network down");
      return { key: "value" };
    });

    await i18n.addActiveNamespaces(["good", "bad"]);

    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError.mock.calls[0]![0]).toMatchObject({
      message: '[i18n] Partial namespace load failure for "en": 1/2 failed (bad)',
    });
  });
});

describe("addActiveNamespaces()", () => {
  it("announces the activation as a configChanged of source namespaceActivated", async () => {
    const configChanged = vi.fn();
    const i18n = makeHost();
    i18n.registerLoader(async () => ({ key: "value" }));
    i18n.on("configChanged", configChanged);

    await i18n.addActiveNamespace("x");

    expect(configChanged).toHaveBeenCalledTimes(1);
    expect(configChanged).toHaveBeenCalledWith({ source: "namespaceActivated" });
  });
});
