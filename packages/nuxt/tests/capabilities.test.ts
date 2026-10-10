import { describe, it, expect } from "vitest";
import * as vue from "@comvi/vue";
import * as nuxtCapabilities from "../src/runtime/composables/capabilities";

/**
 * `src/runtime/composables/capabilities.ts` is a pure re-export of @comvi/vue's
 * capability composables — nuxt adds no wrapper, so the only thing worth
 * asserting here is IDENTITY: the auto-imported nuxt name and the vue export
 * are the same function object. Behaviour (host resolution, the WeakMap bag,
 * the throw on a missing capability) is @comvi/vue's suite's job; duplicating
 * it here would only test vue twice.
 *
 * The identity matters because the nuxt module auto-imports these names
 * (src/module.ts `addImports`): a component that calls the auto-imported
 * `useI18nLoader` and one that imports it from `@comvi/vue` directly must hit
 * the same module instance, or the module-level WeakMap would hand out two
 * different bags for one host.
 */
describe("runtime capability composables", () => {
  it("re-exports the very same function references as @comvi/vue", () => {
    expect(nuxtCapabilities.useI18nLoader).toBe(vue.useI18nLoader);
    expect(nuxtCapabilities.useI18nPlugins).toBe(vue.useI18nPlugins);
  });

  it("exposes exactly the two capability composables and nothing else", () => {
    expect(Object.keys(nuxtCapabilities).sort()).toEqual(["useI18nLoader", "useI18nPlugins"]);
  });
});
