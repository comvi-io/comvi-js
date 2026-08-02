import { describe, it, expect } from "vitest";
import { I18n } from "../../src";
import { createI18n as createSlimI18n } from "../../src/slim";
import { attachLoader } from "../../src/loader";
import { attachPlugins } from "../../src/plugins";

/**
 * The two-phase destroy contract (plan R10).
 *
 * Capability cleanup must run while capability state is still live, and
 * `destroyed` listeners must still observe that state; only afterwards may a
 * capability reset itself. Extracting the loader/plugin capabilities out of
 * the class must not reorder any of it.
 */
describe("destroy ordering", () => {
  it("runs cleanup, then lifecycle events, then capability reset", async () => {
    const order: string[] = [];
    const i18n = new I18n({ locale: "en", exposeGlobal: false });

    // "pending" never resolves, so a load is still in flight at destroy time
    // and the destroy path emits `loadingStateChanged`.
    i18n.registerLoader(async (_locale, ns) =>
      ns === "pending" ? new Promise<never>(() => {}) : { hello: "Hello" },
    );
    i18n.use(() => {
      i18n.setPluginData("probe", "set");
      return () => {
        // Phase 1: capability state is still live here.
        order.push("cleanup");
        expect(i18n.getLoader(), "loader still registered during cleanup").toBeDefined();
        expect(i18n.getPluginData("probe")).toBe("set");
      };
    });
    await i18n.init();

    void i18n.addActiveNamespaces(["pending"]);
    expect(i18n.isLoading).toBe(true);

    i18n.on("loadingStateChanged", () => order.push("loadingStateChanged"));
    i18n.on("destroyed", () => {
      // Phase 2: listeners still see the capability state.
      order.push("destroyed");
      expect(i18n.getLoader(), "loader still registered during `destroyed`").toBeDefined();
      expect(i18n.getPluginData("probe")).toBe("set");
    });

    await i18n.destroy();

    expect(order).toEqual(["cleanup", "loadingStateChanged", "destroyed"]);

    // Phase 3: capability state is reset only after destroy() resolves.
    expect(i18n.getLoader()).toBeUndefined();
    expect(i18n.getPluginData("probe")).toBeUndefined();
    expect(i18n.getActiveNamespaces()).toEqual([]);
  });

  it("clears base state on a bare slim instance (no capabilities attached)", async () => {
    const i18n = createSlimI18n({ locale: "en", exposeGlobal: false });
    i18n.addTranslations({ en: { hello: "Hello" } });

    expect(i18n.getActiveNamespaces()).toEqual(["default"]);
    expect(i18n.t("hello")).toBe("Hello");

    await i18n.destroy();

    expect(i18n.getActiveNamespaces()).toEqual([]);
    expect(i18n.getTranslations()).toEqual({});
  });

  it("resets attached loader state on a composed slim instance", async () => {
    const i18n = attachLoader(createSlimI18n({ locale: "en", exposeGlobal: false }));
    i18n.registerLoader(async () => ({ hello: "Hello" }));
    await i18n.init();

    expect(i18n.getLoader()).toBeDefined();

    await i18n.destroy();

    expect(i18n.getLoader()).toBeUndefined();
    expect(i18n.getActiveNamespaces()).toEqual([]);
  });

  it("keeps the two-phase order on a composed slim instance", async () => {
    const order: string[] = [];
    const i18n = attachPlugins(attachLoader(createSlimI18n({ locale: "en", exposeGlobal: false })));

    i18n.registerLoader(async () => ({ hello: "Hello" }));
    i18n.use(() => {
      i18n.setPluginData("probe", "set");
      return () => {
        order.push("cleanup");
        expect(i18n.getLoader(), "loader still registered during cleanup").toBeDefined();
        expect(i18n.getPluginData("probe")).toBe("set");
      };
    });
    await i18n.init();

    i18n.on("destroyed", () => {
      order.push("destroyed");
      expect(i18n.getPluginData("probe"), "plugin state live during `destroyed`").toBe("set");
    });

    await i18n.destroy();

    expect(order).toEqual(["cleanup", "destroyed"]);
    expect(i18n.getLoader()).toBeUndefined();
    expect(i18n.getPluginData("probe")).toBeUndefined();
    expect(i18n.getLanguageDetector()).toBeUndefined();
    expect(i18n.getActiveNamespaces()).toEqual([]);
  });
});
