// `ssrLocale` has to reach the core BEFORE the reactive ref is seeded, or the
// ref and `core.locale` disagree for one render — which is why vue's preset is
// a real function and core's constructor is re-exported as `createCore`.
//
// Its own module because it is the only one that constructs a core: an app
// composing its own host and calling `createI18nFromCore` never runs it.
import { I18n } from "@comvi/core";
import type { DefaultTranslationParams, I18nOptions } from "@comvi/core";
import { VueI18n, type VueI18nOptions } from "./VueI18n";

/**
 * Create a Vue i18n instance on a `@comvi/core` host built here for you.
 *
 * The host is the BASE one: text + `{param}`, the cache, events and default
 * params. Capabilities are imports the app adds — ICU as `compiler:
 * icuCompiler` in this same options object for an inline catalog, and the
 * loader / plugin host / devtools through the pipe,
 * `createI18n(options).core.with(loader())`, or `createCore(...)` +
 * `createI18nFromCore` when you want the composed host's exact type.
 *
 * @example
 * ```ts
 * const i18n = createI18n({ locale: "en", translation: { en: { hi: "Hi" } } });
 * createApp(App).use(i18n).mount("#app");
 * ```
 */
export function createI18n<const D extends DefaultTranslationParams = {}>(
  options: VueI18nOptions<D>,
): VueI18n<D, I18n<D>> {
  const core = new I18n<D>({
    ...options,
    locale: options.ssrLocale ?? options.locale,
  } as I18nOptions<D>);

  return new VueI18n<D, I18n<D>>(core, options);
}
