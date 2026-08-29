import { describe, it, expect, vi } from "vitest";
import { createI18n } from "../../src";
import { attachLoader } from "../../src/loader";
import { attachPlugins, ensureInstallable, plugins } from "../../src/plugins";
import type { I18n } from "../../src/core/i18n";
import type { I18nPlugin } from "../../src/plugins/types";

/**
 * The two plugins-only misuse guards (single-entry convergence, plan §4).
 *
 * Installers and plugins are both "a function of the host" and NOTHING brands
 * them apart — `.with` stays a dumb pipe, so the type system rejects the two
 * cross-uses and these guards make the runtime reject them too:
 *
 *   1. the NESTED-USE guard — `ensureInstallable`, the first ensure-step of
 *      every lowercase plugin-package installer. `.use(fetchLoader(…))` runs
 *      the installer from inside the init drain loop; the guard throws there,
 *      before any capability is attached and before a second plugin is queued;
 *   2. the RETURN-SHAPE guard — `init()` accepts only `undefined` or a cleanup
 *      function back from a plugin. That is what catches the OTHER misuse
 *      mechanism: an identity installer (the in-context editor's `production`
 *      condition) has no ensure-step to reject `.use`, so it runs, hands the
 *      host back, and is rejected on the way out — before a cleanup is
 *      registered.
 *
 * Both live in `@comvi/core/plugins`, so only a graph that composes the plugin
 * host pays for them.
 */

/** A base host with the plugin capability and nothing else. */
const pluginHost = () => createI18n({ locale: "en", exposeGlobal: false }).with(plugins());

/**
 * The shape every lowercase plugin-package installer has: guard first, then
 * the ensure-steps, then route into the host's own `use`. Standing in for
 * `fetchLoader` so core can pin the contract without depending on a package
 * that peer-depends on it.
 */
function installerLike(inner: I18nPlugin) {
  return <T extends I18n<any>>(i18n: T) => {
    const host = attachPlugins(attachLoader(ensureInstallable(i18n, "fetchLoader")));
    host.use(inner);
    return host;
  };
}

describe("nested-use guard", () => {
  it("is transparent on the valid `.with` path", () => {
    const i18n = createI18n({ locale: "en", exposeGlobal: false });

    expect(ensureInstallable(i18n, "fetchLoader")).toBe(i18n);
  });

  it("lets a real installer compose through `.with`", async () => {
    const inner = vi.fn<I18nPlugin>(() => undefined);
    const i18n = createI18n({ locale: "en", exposeGlobal: false }).with(installerLike(inner));

    await i18n.init();

    expect(typeof i18n.registerLoader).toBe("function");
    expect(typeof i18n.use).toBe("function");
    expect(inner).toHaveBeenCalledTimes(1);
  });

  it("rejects `.use(installer)` at init, actionably and by name", async () => {
    const i18n = pluginHost();
    i18n.use(installerLike(() => undefined) as unknown as I18nPlugin);

    await expect(i18n.init()).rejects.toThrow(/fetchLoader\(\) is a \.with\(…\) installer/);
  });

  it("mutates nothing: no attachment, no queued plugin, no cleanup", async () => {
    const inner = vi.fn<I18nPlugin>(() => () => undefined);
    const i18n = pluginHost();
    i18n.use(installerLike(inner) as unknown as I18nPlugin);

    await expect(i18n.init()).rejects.toThrow();

    // The guard fired at the INNERMOST expression, so `attachLoader` never ran…
    expect((i18n as Record<string, unknown>).registerLoader).toBeUndefined();
    // …the installer never reached `use`, so its plugin never entered the queue…
    expect(inner).not.toHaveBeenCalled();
    // …and destroy has no cleanup to run.
    await expect(i18n.destroy()).resolves.toBeUndefined();
  });

  it("is TRANSIENT: the same installer composes fine after init has finished", async () => {
    const i18n = pluginHost();
    await i18n.init();

    const inner = vi.fn<I18nPlugin>(() => undefined);
    expect(i18n.with(installerLike(inner))).toBe(i18n);
    expect(typeof i18n.registerLoader).toBe("function");
  });

  it("stays closed after a plugin throws, so a later install still works", async () => {
    const i18n = pluginHost();
    i18n.use(() => {
      throw new Error("boom");
    });

    await expect(i18n.init()).rejects.toThrow("boom");

    const i18nAgain = i18n.with(installerLike(() => undefined));
    expect(i18nAgain).toBe(i18n);
  });
});

describe("plugin init return-shape guard", () => {
  const host = {};
  const rejected: [label: string, value: unknown][] = [
    ["a host-shaped object", host],
    ["a plain object", { cleanup: true }],
    ["an array", []],
    ["null", null],
    ["a string", "cleanup"],
    ["a number", 0],
    ["a boolean", true],
    ["a symbol", Symbol("cleanup")],
  ];

  it.each(rejected)("rejects %s", async (_label, value) => {
    const i18n = pluginHost();
    i18n.use((() => value) as unknown as I18nPlugin);

    await expect(i18n.init()).rejects.toThrow(/A plugin returned a value/);
  });

  it.each(rejected)("registers no cleanup for %s and keeps LIFO intact", async (_label, value) => {
    const order: string[] = [];
    const onError = vi.fn();
    const i18n = pluginHost();

    i18n.use(() => () => void order.push("first"));
    i18n.use((() => value) as unknown as I18nPlugin, { required: false, onError });
    i18n.use(() => () => void order.push("third"));

    await i18n.init();

    // The offender did not stop init, and it did not register anything.
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError.mock.calls[0][0]).toBeInstanceOf(Error);
    expect(i18n.isInitialized).toBe(true);

    await i18n.destroy();
    expect(order).toEqual(["third", "first"]);
  });

  it("resolves an async plugin's value before judging it", async () => {
    const i18n = pluginHost();
    i18n.use((async () => ({ nope: true })) as unknown as I18nPlugin);

    await expect(i18n.init()).rejects.toThrow(/A plugin returned a value/);
  });

  it("still accepts nothing", async () => {
    const i18n = pluginHost();
    const plugin = vi.fn<I18nPlugin>(() => undefined);
    i18n.use(plugin);

    await expect(i18n.init()).resolves.toBe(i18n);
    expect(plugin).toHaveBeenCalledTimes(1);
  });

  it("still accepts a cleanup function, sync and async", async () => {
    const order: string[] = [];
    const i18n = pluginHost();

    i18n.use(() => () => void order.push("sync"));
    i18n.use(async () => async () => void order.push("async"));

    await i18n.init();
    await i18n.destroy();

    expect(order).toEqual(["async", "sync"]);
  });

  it("leaves required/timeout/onError semantics exactly as they were", async () => {
    const onError = vi.fn();
    const i18n = pluginHost();

    i18n.use((() => 1) as unknown as I18nPlugin, { onError });

    await expect(i18n.init()).rejects.toThrow(/A plugin returned a value/);
    expect(onError).toHaveBeenCalledTimes(1);
    expect(i18n.isInitialized).toBe(false);
  });

  it("times out before it can return anything", async () => {
    vi.useFakeTimers();
    try {
      // Executor form on purpose: this promise must NEVER settle, so there is
      // nothing for `Promise.withResolvers` to hand back, and it keeps the
      // suite runnable on the Node versions that predate that method.
      const i18n = pluginHost();
      i18n.use(() => new Promise<void>(() => {}), { timeout: 100 });

      const init = i18n.init();
      vi.advanceTimersByTime(150);

      await expect(init).rejects.toThrow(/timed out|E_PLUGIN_INIT_TIMEOUT/);
    } finally {
      vi.runOnlyPendingTimers();
      vi.useRealTimers();
    }
  });
});
