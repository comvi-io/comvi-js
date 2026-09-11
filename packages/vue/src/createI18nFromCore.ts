// Constructs nothing itself, so vue's one-call preset (`createI18n.ts`) stays
// out of the graph of an app that is handed a host built elsewhere.
import type { DefaultTranslationParams, WrapperI18nHost } from "@comvi/core";
import { VueI18n, type VueI18nCoreOptions } from "./VueI18n";

/**
 * Wrap an existing core host in Vue reactivity — the ESCAPE HATCH, for a host
 * built somewhere other than next to the app: Nuxt's `hostModule`, or one host
 * shared between a Vue app and non-Vue code. An app that builds its own host
 * here wants `createI18n(options).use(installer)` instead, which composes on
 * the host this package builds and widens `i18n.core` the same way.
 *
 * The host's exact type is preserved as `VueI18n["core"]`, so a composed host
 * keeps its capabilities at the type level while a base host does not:
 * `createI18nFromCore(attachLoader(core)).core.reloadTranslations(...)`
 * compiles, `createI18nFromCore(baseCore).core.reloadTranslations(...)`
 * does not. {@link VueI18n.use} works on the result as well, widening from
 * whatever type came in.
 *
 * @param core - The host, built elsewhere: core's own constructor, re-exported
 *   from `@comvi/vue` as `createCore`, plus whatever capabilities it composed.
 * @param options - Vue-layer options only; every core option belongs to the
 *   host you built.
 *
 * @example
 * ```ts
 * import { attachLoader, createCore, createI18nFromCore } from "@comvi/vue";
 *
 * const i18n = createI18nFromCore(attachLoader(createCore({ locale: "en" })));
 * i18n.core.registerLoader(myLoader);
 * ```
 */
export function createI18nFromCore<
  D extends DefaultTranslationParams = {},
  C extends WrapperI18nHost<D> = WrapperI18nHost<D>,
>(core: C, options: VueI18nCoreOptions = {}): VueI18n<D, C> {
  return new VueI18n<D, C>(core, options);
}
