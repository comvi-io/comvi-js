// Constructs nothing itself, so vue's one-call preset (`createI18n.ts`) stays
// out of the graph of an app that composes its own host.
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
 * @param core - A host built by the app: `createCore` from `@comvi/vue` (core's
 *   own constructor, re-exported by name), plus whatever capabilities it
 *   composed on.
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
