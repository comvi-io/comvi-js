// The core-constructing path for `@comvi/vue` — the module that names
// `@comvi/core`'s class as a value on the root vue entry (framework-slim P4
// step 1).
//
// It lives alone so that an app which builds its own host and calls
// `createI18nFromCore` never pulls core's constructor in: with
// `sideEffects: false` and this module unused, the import below is a prunable
// named binding.
import { I18n } from "@comvi/core";
import type { DefaultTranslationParams, I18nOptions } from "@comvi/core";
import { VueI18n, type VueI18nOptions } from "./VueI18n";

/**
 * Create a Vue i18n instance on a `@comvi/core` host built here for you.
 *
 * The call signature is unchanged from 0.4.x, but `@comvi/core` is one BASE
 * entry now, so that is the host you get: text + `{param}`, the cache, events
 * and default params. Capabilities are imports the app adds — ICU is
 * `compiler: icuCompiler` (`@comvi/core/icu`) in this same options object,
 * while the loader (`@comvi/core/loader`) and the plugin host
 * (`@comvi/core/plugins`) go onto a host you compose yourself and hand to
 * `createI18nFromCore`.
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
