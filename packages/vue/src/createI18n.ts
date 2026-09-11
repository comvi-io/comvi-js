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
 * params. Capabilities are imports the app composes on the result with
 * `.with(installer)`, each widening `i18n.core`'s type: `icu()`, `loader()`,
 * `plugins()`, `devtools()`, or a plugin's own installer such as `fetchLoader()`.
 * For an inline `translation` catalog, ICU is `compiler: icuCompiler` in this
 * same options object, because the catalog is ingested before any `.with` runs.
 *
 * @example
 * ```ts
 * const i18n = createI18n({ locale: "en", translation: { en: { hi: "Hi" } } });
 * createApp(App).use(i18n).mount("#app");
 * ```
 *
 * @example
 * ```ts
 * const i18n = createI18n({ locale: "en" })
 *   .with(icu())
 *   .with(fetchLoader({ apiUrl, projectId }));
 * i18n.core.reloadTranslations(); // typed: `.with` widened `core`
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
