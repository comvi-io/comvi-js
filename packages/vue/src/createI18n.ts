// The ROOT construction path — the only module in @comvi/vue that names the
// root `@comvi/core` entry as a value (framework-slim P4 step 1).
//
// It lives alone so that an app which builds its own host and calls
// `createI18nFromCore` never pulls the root entry: with `sideEffects: false`
// and this module unused, the import below is a prunable named binding.
import { I18n } from "@comvi/core";
import type { DefaultTranslationParams, I18nOptions } from "@comvi/core";
import { VueI18n, type VueI18nOptions } from "./VueI18n";

/**
 * Create a Vue i18n instance on a full-capability root core.
 *
 * Signature and behavior are unchanged from 0.4.x: the core is constructed
 * internally from the same options object.
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
