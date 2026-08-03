// The one-call SLIM construction path for `@comvi/vue/slim` (framework-slim
// DX pass). Sibling of `createI18n.ts`, which is the ROOT one: both export a
// function named `createI18n`, and the entry that re-exports it decides which
// core an app gets — exactly the convention `@comvi/core` itself uses.
//
// Root-free BY CONSTRUCTION: the only core specifier named here is the pure
// `@comvi/core/slim` subpath, so nothing in this module can pull the
// side-effectful root entry (and with it ambient `registerTagSyntax()`) into
// a slim vue graph.
//
// The host it builds is BARE: text + `{param}`, no loader, no plugin host, no
// devtools discovery, no ICU. Compose what you need — every piece is
// re-exported from `@comvi/vue/slim` too, so an app still names one package:
//
//   • ICU:        `createI18n({ …, compiler: icuCompiler })`
//   • capability: `attachLoader(i18n.core).registerLoader(myLoader)`
//   • from scratch: `createI18nFromCore(attachLoader(createCore({ … })))`
import { createI18n as createCore } from "@comvi/core/slim";
import type { DefaultTranslationParams, FactoryI18nOptions, I18n } from "@comvi/core/slim";
import { VueI18n, type VueI18nCoreOptions } from "./VueI18n";

/**
 * Options for the slim `createI18n`: every core option the slim entry accepts
 * — including `compiler`, so `icuCompiler` can be injected without leaving
 * the package — plus the Vue-layer ones.
 */
export type VueSlimI18nOptions<D extends DefaultTranslationParams = {}> = FactoryI18nOptions<D> &
  VueI18nCoreOptions;

/**
 * Create a Vue i18n instance on a bare `@comvi/core/slim` host, in one call.
 *
 * Same shape as `@comvi/vue`'s `createI18n`, and the same `ssrLocale`
 * handling — the core is built with the render locale so the reactive ref and
 * `core.locale` cannot disagree at construction. What differs is the host:
 * `i18n.core` is a slim `I18n`, so the loader and plugin-host members are
 * absent in types AND at runtime until you attach them.
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
  } as FactoryI18nOptions<D>);

  return new VueI18n<D, I18n<D>>(core, options);
}
