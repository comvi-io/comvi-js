import { describe, it, expect, vi } from "vitest";
// The COMPOSITE host (`src/core/full.ts`), imported directly rather than
// through the tags-registering helper.
import { I18n } from "../../src/core/full";
import { createI18n as createBaseI18n } from "../../src";
import { attachLoader } from "../../src/loader";
import { attachPlugins } from "../../src/plugins";

/**
 * The two-phase destroy contract: capability cleanup runs while capability
 * state is still live, `destroyed` listeners still observe that state, and only
 * afterwards may a capability reset itself.
 */
describe("destroy ordering", () => {
  it("runs cleanup, then lifecycle events, then capability reset", async () => {
    const order: string[] = [];
    // `_preDestroy` and `_emit` swallow listener exceptions, so an `expect()`
    // written inside the cleanup or the `destroyed` listener could never fail.
    // The phases record what they saw; the assertions run after destroy().
    const seen: Record<string, unknown> = {};
    const onError = vi.fn();
    const i18n = new I18n({ locale: "en", exposeGlobal: false, onError });

    const loaderFn = async (_locale: string, ns: string) =>
      ns === "pending" ? new Promise<never>(() => {}) : { hello: "Hello" };
    // "pending" never resolves, so a load is still in flight at destroy time and
    // the destroy path emits `loadingStateChanged`.
    i18n.registerLoader(loaderFn);
    i18n.use(() => {
      i18n.setPluginData("probe", "set");
      return () => {
        order.push("cleanup");
        seen.loaderInCleanup = i18n.getLoader();
        seen.dataInCleanup = i18n.getPluginData("probe");
      };
    });
    await i18n.init();

    void i18n.addActiveNamespaces(["pending"]);
    expect(i18n.isLoading).toBe(true);

    i18n.on("loadingStateChanged", () => order.push("loadingStateChanged"));
    i18n.on("destroyed", () => {
      order.push("destroyed");
      seen.loaderInDestroyed = i18n.getLoader();
      seen.dataInDestroyed = i18n.getPluginData("probe");
    });

    await i18n.destroy();

    expect(order).toEqual(["cleanup", "loadingStateChanged", "destroyed"]);

    expect(seen).toEqual({
      loaderInCleanup: loaderFn,
      dataInCleanup: "set",
      loaderInDestroyed: loaderFn,
      dataInDestroyed: "set",
    });
    expect(onError).not.toHaveBeenCalled();

    // Phase 3: capability state is reset only after destroy() resolves.
    expect(i18n.getLoader()).toBeUndefined();
    expect(i18n.getPluginData("probe")).toBeUndefined();
    expect(i18n.getActiveNamespaces()).toEqual([]);
  });

  it("clears base state on a bare slim instance (no capabilities attached)", async () => {
    const i18n = createBaseI18n({ locale: "en", exposeGlobal: false });
    i18n.addTranslations({ en: { hello: "Hello" } });

    expect(i18n.getActiveNamespaces()).toEqual(["default"]);
    expect(i18n.t("hello")).toBe("Hello");

    await i18n.destroy();

    expect(i18n.getActiveNamespaces()).toEqual([]);
    expect(i18n.getTranslations()).toEqual({});
  });

  it("resets attached loader state on a composed slim instance", async () => {
    const i18n = attachLoader(createBaseI18n({ locale: "en", exposeGlobal: false }));
    const loaderFn = async () => ({ hello: "Hello" });
    i18n.registerLoader(loaderFn);
    await i18n.init();

    expect(i18n.getLoader()).toBe(loaderFn);

    await i18n.destroy();

    expect(i18n.getLoader()).toBeUndefined();
    expect(i18n.getActiveNamespaces()).toEqual([]);
  });

  it("keeps the two-phase order on a composed slim instance", async () => {
    const order: string[] = [];
    const seen: Record<string, unknown> = {};
    const onError = vi.fn();
    const i18n = attachPlugins(
      attachLoader(createBaseI18n({ locale: "en", exposeGlobal: false, onError })),
    );

    const loaderFn = async () => ({ hello: "Hello" });
    i18n.registerLoader(loaderFn);
    i18n.use(() => {
      i18n.setPluginData("probe", "set");
      return () => {
        order.push("cleanup");
        seen.loaderInCleanup = i18n.getLoader();
        seen.dataInCleanup = i18n.getPluginData("probe");
      };
    });
    await i18n.init();

    i18n.on("destroyed", () => {
      order.push("destroyed");
      seen.dataInDestroyed = i18n.getPluginData("probe");
    });

    await i18n.destroy();

    expect(order).toEqual(["cleanup", "destroyed"]);
    expect(seen).toEqual({
      loaderInCleanup: loaderFn,
      dataInCleanup: "set",
      dataInDestroyed: "set",
    });
    expect(onError).not.toHaveBeenCalled();

    expect(i18n.getLoader()).toBeUndefined();
    expect(i18n.getPluginData("probe")).toBeUndefined();
    expect(i18n.getLanguageDetector()).toBeUndefined();
    expect(i18n.getActiveNamespaces()).toEqual([]);
  });

  it("is idempotent: a second destroy() re-runs no cleanup and re-emits nothing", async () => {
    const order: string[] = [];
    const i18n = attachPlugins(attachLoader(createBaseI18n({ locale: "en", exposeGlobal: false })));

    i18n.registerLoader(async () => ({ hello: "Hello" }));
    i18n.use(() => () => void order.push("cleanup"));
    i18n.on("destroyed", () => order.push("destroyed"));
    await i18n.init();
    await i18n.destroy();

    await expect(i18n.destroy()).resolves.toBeUndefined();

    expect(order).toEqual(["cleanup", "destroyed"]);
  });
});
