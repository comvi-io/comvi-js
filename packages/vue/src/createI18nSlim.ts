// The one-call construction path for `@comvi/vue/slim` (framework-slim DX
// pass). Sibling of `createI18n.ts`, the `@comvi/vue` one: both export a
// function named `createI18n`, and the entry that re-exports it decides what
// an app's graph looks like — exactly the convention `@comvi/core` itself
// uses.
//
// Since the single-entry convergence the two siblings build the SAME core:
// `@comvi/core` is one base entry and it is pure, so neither can drag ambient
// `registerTagSyntax()` into a vue graph. What still differs is the ENTRY
// around them — `@comvi/vue/slim` drops `index.ts`'s `export * from
// "@comvi/core"` (it names the base root's constructor as `createCore`
// instead) and brings the capability toolkit with it (see `slim.ts`) — and
// this module stays until that split is retired.
//
// The host it builds is BARE: text + `{param}`, no loader, no plugin host, no
// devtools discovery, no ICU. Compose what you need — every piece is
// re-exported from `@comvi/vue/slim` too, so an app still names one package:
//
//   • ICU:        `createI18n({ …, compiler: icuCompiler })`
//   • capability: `attachLoader(i18n.core).registerLoader(myLoader)`
//   • from scratch: `createI18nFromCore(attachLoader(createCore({ … })))`
import { createI18n as createCore } from "@comvi/core";
import type { DefaultTranslationParams, I18nOptions, I18n } from "@comvi/core";
import { VueI18n, type VueI18nCoreOptions } from "./VueI18n";

/**
 * Options for the slim `createI18n`: every core option the slim entry accepts
 * — including `compiler`, so `icuCompiler` can be injected without leaving
 * the package — plus the Vue-layer ones.
 */
export type VueSlimI18nOptions<D extends DefaultTranslationParams = {}> = I18nOptions<D> &
  VueI18nCoreOptions;

/**
 * Create a Vue i18n instance on a bare `@comvi/core` host, in one call.
 *
 * Same shape as `@comvi/vue`'s `createI18n`, and the same `ssrLocale`
 * handling — the core is built with the render locale so the reactive ref and
 * `core.locale` cannot disagree at construction. Both build the same base
 * `I18n`: the loader and plugin-host members are absent in types AND at
 * runtime until you compose them in. What differs is the entry, not the host.
 *
 * @example
 * ```ts
 * import { createI18n } from "@comvi/vue/slim";
 *
 * const i18n = createI18n({ locale: "en", translation: { en: { hi: "Hi" } } });
 * createApp(App).use(i18n).mount("#app");
 * ```
 */
export function createI18n<const D extends DefaultTranslationParams = {}>(
  options: VueSlimI18nOptions<D>,
): VueI18n<D, I18n<D>> {
  const core = createCore<D>({
    ...options,
    locale: options.ssrLocale ?? options.locale,
  } as I18nOptions<D>);

  return new VueI18n<D, I18n<D>>(core, options);
}
