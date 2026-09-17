import { describe, it, expect, vi } from "vitest";
import { I18n } from "../helpers/composedHost";
import type { I18nPlugin } from "../helpers/composedHost";
import { createI18n as createBaseI18n } from "../../src";
import { attachLoader } from "../../src/loader";
import { attachPlugins } from "../../src/plugins";
import { createDeferred } from "../helpers/deferred";
import { flushMicrotasks } from "../helpers/flush";

/**
 * `destroy()` racing an operation that is ALREADY IN FLIGHT.
 *
 * `destroy-order.test.ts` covers the phase order of a destroy that nothing
 * races. These are the five: an `init()` mid-flight, a plugin cleanup that
 * arrives after the drain, a second `destroy()` while the first is still
 * draining, a locale switch mid-flight, and — the one race against nothing at
 * all — a loader that throws synchronously, which settles before the
 * pending-load bookkeeping around it has run.
 *
 * Gotcha the helpers repeat and this suite depends on: `_emit` and
 * `_preDestroy` swallow listener exceptions, so every observation is recorded
 * into a variable and asserted after the await.
 */

describe("init() racing destroy()", () => {
  it("does not initialize when destroy() lands while a plugin is still running", async () => {
    const gate = createDeferred<void>();
    const initialized = vi.fn();
    const onError = vi.fn();

    const i18n = new I18n({ locale: "en", exposeGlobal: false, onError });
    i18n.registerPlugin(async () => {
      await gate.promise;
    });
    i18n.on("initialized", initialized);

    const initPromise = i18n.init();
    await flushMicrotasks();
    expect(i18n.isInitializing).toBe(true);

    await i18n.destroy();
    gate.resolve();

    await expect(initPromise).resolves.toBe(i18n);
    expect(i18n.isInitialized).toBe(false);
    expect(initialized).not.toHaveBeenCalled();
    expect(onError).not.toHaveBeenCalled();
  });

  it("does not initialize when destroy() lands while the initial namespaces load", async () => {
    const load = createDeferred<Record<string, string>>();
    const initialized = vi.fn();
    const onError = vi.fn();

    const i18n = new I18n({ locale: "en", ns: ["late"], exposeGlobal: false, onError });
    i18n.registerLoader(async () => load.promise);
    i18n.on("initialized", initialized);

    const initPromise = i18n.init();
    await flushMicrotasks();

    await i18n.destroy();
    load.resolve({ hello: "Hello" });

    await expect(initPromise).resolves.toBe(i18n);
    expect(i18n.isInitialized).toBe(false);
    expect(initialized).not.toHaveBeenCalled();
    expect(onError).not.toHaveBeenCalled();
    // Destroy cleared the active-namespace set; a resumed init() must not
    // re-activate it or write the catalog back into the cleared cache.
    expect(i18n.getActiveNamespaces()).toEqual([]);
    expect(i18n.getLoadedLocales()).toEqual([]);
  });
});

describe("plugin cleanups racing destroy()", () => {
  it("runs a cleanup that arrives after the destroy drain", async () => {
    const gate = createDeferred<void>();
    const cleanup = vi.fn();

    const i18n = attachPlugins(attachLoader(createBaseI18n({ locale: "en", exposeGlobal: false })));
    i18n.registerPlugin(async () => {
      await gate.promise;
      return cleanup;
    });

    const initPromise = i18n.init();
    await flushMicrotasks();

    await i18n.destroy();
    expect(cleanup).not.toHaveBeenCalled();

    gate.resolve();
    await initPromise;
    await flushMicrotasks();

    expect(cleanup).toHaveBeenCalledTimes(1);
  });

  it("reports a throw from a late cleanup as source plugin-cleanup", async () => {
    const gate = createDeferred<void>();
    const onError = vi.fn();
    const boom = new Error("late cleanup exploded");

    const i18n = attachPlugins(
      attachLoader(createBaseI18n({ locale: "en", exposeGlobal: false, onError })),
    );
    i18n.registerPlugin(async () => {
      await gate.promise;
      return () => {
        throw boom;
      };
    });

    const initPromise = i18n.init();
    await flushMicrotasks();
    await i18n.destroy();

    gate.resolve();
    await initPromise;
    await flushMicrotasks();

    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError.mock.calls[0][0]).toBe(boom);
    expect(onError.mock.calls[0][1]).toMatchObject({ source: "plugin-cleanup" });
  });

  it("starts no further plugin once destroy() has landed", async () => {
    const gate = createDeferred<void>();
    const second = vi.fn();

    const i18n = attachPlugins(attachLoader(createBaseI18n({ locale: "en", exposeGlobal: false })));
    const first: I18nPlugin = async () => {
      await gate.promise;
    };
    i18n.registerPlugin(first);
    i18n.registerPlugin(second);

    const initPromise = i18n.init();
    await flushMicrotasks();

    await i18n.destroy();
    gate.resolve();
    await initPromise;
    await flushMicrotasks();

    expect(second).not.toHaveBeenCalled();
  });
});

describe("destroy() racing itself", () => {
  it("resolves every call only once the single cleanup has settled", async () => {
    const order: string[] = [];

    const i18n = attachPlugins(attachLoader(createBaseI18n({ locale: "en", exposeGlobal: false })));
    i18n.registerPlugin(
      () => () =>
        new Promise<void>((resolve) =>
          setTimeout(() => {
            order.push("cleanup");
            resolve();
          }, 0),
        ),
    );
    await i18n.init();

    const first = i18n.destroy();
    const second = i18n.destroy();

    // The defect: the second caller was told the teardown was done while the
    // first was still awaiting `_preDestroy`.
    await second;
    expect(order).toEqual(["cleanup"]);

    // And it is not a second teardown either — it is the SAME attempt.
    expect(second).toBe(first);

    await first;
    // Settled: a later call is still the same promise and re-runs nothing.
    expect(i18n.destroy()).toBe(first);
    await i18n.destroy();
    expect(order).toEqual(["cleanup"]);
  });

  it("keeps reporting a cleanup throw and still resolves both callers", async () => {
    const onError = vi.fn();
    const boom = new Error("cleanup exploded");

    const i18n = attachPlugins(
      attachLoader(createBaseI18n({ locale: "en", exposeGlobal: false, onError })),
    );
    i18n.registerPlugin(() => async () => {
      await Promise.resolve();
      throw boom;
    });
    await i18n.init();

    const first = i18n.destroy();
    const second = i18n.destroy();

    await expect(first).resolves.toBeUndefined();
    await expect(second).resolves.toBeUndefined();
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError.mock.calls[0][0]).toBe(boom);
    expect(onError.mock.calls[0][1]).toMatchObject({ source: "plugin-cleanup" });
  });
});

describe("a locale switch racing destroy()", () => {
  it("does not apply a switch that was in flight when destroy() landed", async () => {
    const load = createDeferred<Record<string, string>>();
    const localeChanged = vi.fn();

    const i18n = new I18n({ locale: "en", exposeGlobal: false });
    i18n.registerLoader(async () => load.promise);
    i18n.addTranslations({ en: { hello: "Hello" } });
    await i18n.init();

    const switchPromise = i18n.setLocaleAsync("fr");
    await flushMicrotasks();
    // Registered AFTER init so only the switch's emit can reach it; destroy
    // clears every subscription at phase 2, which is why the assertion below
    // is about `i18n.locale` and not only about the spy.
    i18n.on("localeChanged", localeChanged);

    await i18n.destroy();
    load.resolve({ hello: "Bonjour" });

    await expect(switchPromise).resolves.toBeUndefined();
    expect(i18n.locale).toBe("en");
    expect(localeChanged).not.toHaveBeenCalled();
  });

  it("still applies synchronously with no loader in the graph", () => {
    // The no-loader path CANNOT have a switch in flight: the base
    // `setLocaleAsync` awaits nothing, which is what makes `i18n.locale = "fr"`
    // apply in the same tick. Pinned here so the destroy re-check above is
    // never "fixed" into a version that adds a tick to this path.
    const i18n = createBaseI18n({ locale: "en", exposeGlobal: false });
    i18n.addTranslations({ en: { hello: "Hello" }, fr: { hello: "Bonjour" } });

    i18n.locale = "fr";

    expect(i18n.locale).toBe("fr");
    expect(i18n.t("hello")).toBe("Bonjour");
  });
});

describe("a loader that throws synchronously", () => {
  it("emits loadError, rejects, parks no pending entry, and is retried", async () => {
    let mode: "throw" | "ok" = "throw";
    const loader = vi.fn((_locale: string, _namespace: string) => {
      if (mode === "throw") throw new Error("sync loader boom");
      return Promise.resolve({ hello: "Hola" });
    });
    const loadError = vi.fn();

    const i18n = new I18n({ locale: "en", ns: [], exposeGlobal: false, onError: () => {} });
    i18n.registerLoader(loader as never);
    await i18n.init();
    i18n.on("loadError", loadError);

    // `_loadNs` wraps a total namespace failure; the `loadError` payload is
    // where the loader's own error surfaces.
    await expect(i18n.addActiveNamespace("sync")).rejects.toThrow("Failed to load all namespaces");
    expect(loader).toHaveBeenCalledTimes(1);
    expect(loadError).toHaveBeenCalledTimes(1);
    expect(loadError.mock.calls[0][0]).toMatchObject({ locale: "en", namespace: "sync" });
    expect((loadError.mock.calls[0][0] as { error: Error }).error.message).toBe("sync loader boom");

    // The retry is the point, and `addActiveNamespace` is the path that shows
    // it: `reloadTranslations` cancels pending loads first, so it would mask a
    // parked entry. A parked entry means the loader is never called again and
    // `loadError` is never emitted again.
    await expect(i18n.addActiveNamespace("sync")).rejects.toThrow("Failed to load all namespaces");
    expect(loader).toHaveBeenCalledTimes(2);
    expect(loadError).toHaveBeenCalledTimes(2);

    // And once the loader stops throwing, the same namespace loads.
    mode = "ok";
    await i18n.addActiveNamespace("sync");
    expect(loader).toHaveBeenCalledTimes(3);
    expect(i18n.t("hello", { ns: "sync" })).toBe("Hola");
  });
});
