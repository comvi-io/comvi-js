// The injected-host construction path (framework-slim P4 step 1): wrap a host
// the app composed itself — `createI18n` from `@comvi/core`, optionally with
// `.with(loader())` / `.with(plugins())` — without this package constructing
// anything, so `createI18n.ts` and core's class never enter the graph.
import type { DefaultTranslationParams, WrapperI18nHost } from "@comvi/core";
import { VueI18n, type VueI18nCoreOptions } from "./VueI18n";

/**
 * Wrap an existing core host in Vue reactivity.
 *
 * The host's exact type is preserved as `VueI18n["core"]`, so a composed host
 * keeps its capabilities at the type level while a base host does not:
 * `createI18nFromCore(attachLoader(core)).core.reloadTranslations(...)`
 * compiles, `createI18nFromCore(baseCore).core.reloadTranslations(...)`
 * does not.
 *
 * @param core - A host built by the app: `createI18n` from `@comvi/core`, plus
 *   whatever capabilities it composed on.
 * @param options - Vue-layer options only; every core option belongs to the
 *   host you built.
 *
 * @example
 * ```ts
 * import { createI18n } from "@comvi/core";
 * import { attachLoader } from "@comvi/core/loader";
 * import { createI18nFromCore } from "@comvi/vue";
 *
 * const i18n = createI18nFromCore(attachLoader(createI18n({ locale: "en" })));
 * i18n.core.registerLoader(myLoader);
 * ```
 */
export function createI18nFromCore<
  D extends DefaultTranslationParams = {},
  C extends WrapperI18nHost<D> = WrapperI18nHost<D>,
>(core: C, options: VueI18nCoreOptions = {}): VueI18n<D, C> {
  return new VueI18n<D, C>(core, options);
}
