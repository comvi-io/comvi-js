// `@comvi/nuxt/i18n` exists so the documented `comvi.i18n.ts` recipe is
// followable from `pnpm add @comvi/nuxt` alone — @comvi/core is a dependency of
// THIS package, not of the app. That makes the export list a contract: a name
// dropped here is a recipe a reader cannot follow.
import { describe, expect, it } from "vitest";
import * as core from "@comvi/core";
import * as host from "../src/runtime/i18n";

describe("@comvi/nuxt/i18n", () => {
  it("re-exports exactly the installers a i18nModule factory composes with", () => {
    expect(Object.keys(host).sort()).toEqual([
      "attachLoader",
      "createI18n",
      "defineComviI18n",
      "definePlugin",
      "devtools",
      "formatCurrency",
      "formatDate",
      "formatNumber",
      "formatRelativeTime",
      "icuCompiler",
      "loader",
      "plugins",
    ]);
  });

  it("does not re-export the low-level attach pair for plugins/devtools", () => {
    // Same rule as the binding roots: `plugins()` / `devtools()` are the
    // configured installers, the pair is their low-level synonym, and it stays
    // on `@comvi/core/plugins` / `@comvi/core/devtools`. `attachLoader` is not
    // a synonym — it is the attach-only loader installer — so it stays.
    expect(host).not.toHaveProperty("attachPlugins");
    expect(host).not.toHaveProperty("attachDevtools");
    expect(typeof host.attachLoader).toBe("function");
  });

  it("does not re-export flattenCatalog", () => {
    // The base host flattens a nested catalog itself, so pre-flattening by hand
    // stays on the `@comvi/core` root instead of becoming the answer to a rule.
    expect(host).not.toHaveProperty("flattenCatalog");
  });

  it("defineComviI18n returns the factory it was given", () => {
    const factory = (options: { locale: string }) => host.createI18n(options);
    expect(host.defineComviI18n(factory)).toBe(factory);
  });

  it("composes a working host through this subpath alone", () => {
    const i18n = host
      .createI18n({ locale: "en", compiler: host.icuCompiler, exposeGlobal: false })
      .use(host.attachLoader)
      .use(host.plugins());

    i18n.addMessages({ en: { cart: "{count, plural, one {# item} other {# items}}" } });

    expect(i18n.t("cart", { count: 2 })).toBe("2 items");
    expect(typeof i18n.reloadMessages).toBe("function");
    expect(typeof i18n.registerPlugin).toBe("function");
  });

  it("wraps an inline plugin through definePlugin, not registerPlugin", async () => {
    // `definePlugin` is the one that also ATTACHES the plugin host, which is
    // what makes it usable on a chain that has not composed `plugins()` yet.
    const ran: string[] = [];
    const i18n = host
      .createI18n({ locale: "en", exposeGlobal: false })
      .use(host.definePlugin(() => void ran.push("inline")));

    await i18n.init();

    expect(ran).toEqual(["inline"]);
  });
});

describe("@comvi/nuxt/i18n — the standalone formatters", () => {
  // Derived from core, so a formatter core adds cannot be left off this entry.
  const CORE_FORMATTERS = Object.keys(core)
    .filter((name) => /^format[A-Z]/.test(name))
    .sort();

  it("re-exports exactly core's formatter set, as core's own bindings", () => {
    expect(CORE_FORMATTERS.length).toBeGreaterThan(0);
    expect(
      Object.keys(host)
        .filter((name) => /^format[A-Z]/.test(name))
        .sort(),
    ).toEqual(CORE_FORMATTERS);
    for (const name of CORE_FORMATTERS) {
      expect((host as Record<string, unknown>)[name]).toBe((core as Record<string, unknown>)[name]);
    }
  });
});
