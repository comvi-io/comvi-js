import { describe, expect, it } from "vitest";

/**
 * `@comvi/nuxt/i18n`: what an options file names, as named re-exports of pure core subpaths,
 * and no `createI18n` (the module creates the instance; core's and `@comvi/vue`'s clash).
 */
describe("@comvi/nuxt/i18n", () => {
  it("exports exactly defineI18nOptions, the CDN loaders, devtools and core's formatters", async () => {
    const mod = await import("../src/runtime/i18n");

    expect(Object.keys(mod).sort()).toEqual([
      "api",
      "cdn",
      "createCatalogStore",
      "defineI18nOptions",
      "devtools",
      "displayName",
      "formatCurrency",
      "formatDate",
      "formatDateRange",
      "formatList",
      "formatNumber",
      "formatRelativeTime",
    ]);
  });

  it("re-exports core's own functions, not copies", async () => {
    const mod = await import("../src/runtime/i18n");
    const cdn = await import("@comvi/core/cdn");
    const format = await import("@comvi/core/format");
    const devtools = await import("@comvi/core/devtools");

    expect(mod.cdn).toBe(cdn.cdn);
    expect(mod.api).toBe(cdn.api);
    expect(mod.createCatalogStore).toBe(cdn.createCatalogStore);
    expect(mod.devtools).toBe(devtools.devtools);
    expect(mod.formatNumber).toBe(format.formatNumber);
    expect(mod.formatRelativeTime).toBe(format.formatRelativeTime);
  });

  it("defineI18nOptions returns the factory it was given", async () => {
    const { defineI18nOptions } = await import("../src/runtime/i18n");
    const factory = () => ({});

    expect(defineI18nOptions(factory)).toBe(factory);
  });
});
