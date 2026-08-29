/**
 * The in-flight map of `@comvi/core/loader` (`_loadOne`).
 *
 * One entry per `locale:namespace`, and the entry IS the identity that decides
 * three things when a load finally settles: whether it may write to the cache,
 * whether its failure is observable, and whether it may drop the entry. A load
 * that was cancelled (`reloadTranslations` clears the scope it is about to
 * refetch) or superseded by a newer one for the same key must do none of the
 * three — and, crucially, must not evict the newer load's entry on its way out.
 */
import { describe, it, expect, vi } from "vitest";
import { createI18n } from "../../src";
import { attachLoader } from "../../src/loader";
import { createDeferred, type Deferred } from "../helpers/deferred";
import { flushMicrotasks } from "../helpers/flush";

type Catalog = Record<string, string>;

/** A loader whose every call is settled by the TEST, in call order. */
function queuedLoader() {
  const calls: string[] = [];
  const settlers: Deferred<Catalog>[] = [];

  return {
    calls,
    settle: (index: number, catalog: Catalog) => settlers[index]!.resolve(catalog),
    fail: (index: number, error: Error) => settlers[index]!.reject(error),
    load: (locale: string, namespace: string): Promise<Catalog> => {
      calls.push(`${locale}:${namespace}`);
      const settler = createDeferred<Catalog>();
      settlers.push(settler);
      return settler.promise;
    },
  };
}

function makeHost(onError: (error: Error) => void = () => {}) {
  return attachLoader(createI18n({ locale: "en", ns: [], onError }));
}

describe("in-flight namespace loads", () => {
  it("re-invokes the loader after a failed load — the settled entry no longer dedupes", async () => {
    let attempt = 0;
    const i18n = makeHost();
    i18n.registerLoader(async () => {
      attempt++;
      if (attempt === 1) throw new Error("network down");
      return { key: "second try" };
    });

    await expect(i18n.addActiveNamespace("x")).rejects.toThrow(/Failed to load all namespaces/);
    await i18n.addActiveNamespace("x");

    expect(attempt).toBe(2);
    expect(i18n.t("key", { ns: "x" })).toBe("second try");
  });

  it("keeps the newer load's entry when a superseded load settles (sequence)", async () => {
    const loader = queuedLoader();
    const i18n = makeHost();
    i18n.registerLoader(loader.load);

    const superseded = i18n.addActiveNamespace("x");
    const reload = i18n.reloadTranslations(undefined, "x");
    loader.settle(0, { key: "stale" });
    await flushMicrotasks();

    const joiner = i18n.addActiveNamespace("x");
    await flushMicrotasks();

    // The third activation must JOIN the reload's in-flight load, which the
    // superseded one must not have evicted while settling.
    expect(loader.calls).toEqual(["en:x", "en:x"]);

    loader.settle(1, { key: "fresh" });
    await Promise.all([superseded, reload, joiner]);
    expect(i18n.t("key", { ns: "x" })).toBe("fresh");
  });

  it("swallows the rejection of a load that was cancelled mid-flight", async () => {
    const loadErrors: unknown[] = [];
    const loader = queuedLoader();
    const i18n = makeHost();
    i18n.registerLoader(loader.load);
    i18n.onLoadError((_locale, _namespace, error) => loadErrors.push(error));

    const cancelled = i18n.addActiveNamespace("x");
    const reload = i18n.reloadTranslations(undefined, "x");
    loader.fail(0, new Error("stale request failed"));
    loader.settle(1, { key: "fresh" });
    await Promise.all([cancelled, reload]);

    await expect(cancelled).resolves.toBeUndefined();
    expect(loadErrors).toEqual([]);
    expect(i18n.t("key", { ns: "x" })).toBe("fresh");
  });

  it("emits namespaceLoaded with the namespace and locale that resolved", async () => {
    const loaded = vi.fn();
    const i18n = makeHost();
    i18n.registerLoader(async () => ({ key: "value" }));
    i18n.on("namespaceLoaded", loaded);

    await i18n.addActiveNamespace("admin");

    expect(loaded).toHaveBeenCalledTimes(1);
    expect(loaded).toHaveBeenCalledWith({ namespace: "admin", locale: "en" });
  });

  it("rejects a loaded catalog carrying ICU syntax the host's compiler cannot parse", async () => {
    const loadErrors: Error[] = [];
    const i18n = makeHost();
    i18n.registerLoader(async () => ({ n: "{count, plural, one {#} other {#}}" }));
    i18n.onLoadError((_locale, _namespace, error) => loadErrors.push(error));

    await expect(i18n.addActiveNamespace("x")).rejects.toThrow(/Failed to load all namespaces/);

    expect(loadErrors).toHaveLength(1);
    expect(loadErrors[0]).toMatchObject({ code: "E_ICU_SYNTAX" });
    // The preflight runs BEFORE the cache merge, so nothing was ingested.
    expect(i18n.t("n", { ns: "x" })).toBe("n");
  });

  it("leaves a load for another locale in flight when a different scope is reloaded", async () => {
    const loader = queuedLoader();
    const i18n = makeHost();
    i18n.registerLoader(loader.load);

    const activation = i18n.addActiveNamespace("x");
    const reload = i18n.reloadTranslations("fr", "x");
    loader.settle(1, { key: "fr value" });
    await reload;

    loader.settle(0, { key: "en value" });
    await activation;

    expect(loader.calls).toEqual(["en:x", "fr:x"]);
    expect(i18n.t("key", { ns: "x" })).toBe("en value");
  });
});
