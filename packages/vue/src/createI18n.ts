// Vue's one-call construction path — the module that builds a `VueI18n` around
// a host it constructs for you.
//
// Vue is the one binding whose preset is a REAL function rather than a rename
// of core's constructor: there is a wrapper object to build, and `ssrLocale`
// has to reach the core BEFORE the reactive ref is seeded, or the ref and
// `core.locale` would disagree for one render. That is why the entry exports
// core's own constructor under a name of its own (`createCore`) instead of
// letting it take `createI18n`.
//
// It stays its own module because it is the only one that constructs a core:
// an app that composes its own host and calls `createI18nFromCore` never
// executes this factory. It no longer keeps core's class out of such a graph —
// since the single-entry convergence `index.ts` names `I18n` and `createCore`
// itself, so the base host module is in every graph that reaches this package
// — and that is deliberate: the base entry registers nothing on import.
import { I18n } from "@comvi/core";
import type { DefaultTranslationParams, I18nOptions } from "@comvi/core";
import { VueI18n, type VueI18nOptions } from "./VueI18n";

/**
 * Create a Vue i18n instance on a `@comvi/core` host built here for you.
 *
 * The call signature is unchanged from 0.4.x, but `@comvi/core` is one BASE
 * entry now, so that is the host you get: text + `{param}`, the cache, events
 * and default params. Capabilities are imports the app adds, and every one of
 * them is re-exported by `@comvi/vue` — ICU is `compiler: icuCompiler` in this
 * same options object for an inline catalog, while the loader, the plugin host
 * and devtools discovery go onto the host through the pipe:
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
