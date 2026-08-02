import type { InjectionKey } from "vue";
import type { AnyVueI18n } from "./VueI18n";

/**
 * Injection key for Vue's provide/inject pattern
 * Used to inject the i18n instance into Vue components
 *
 * The core is seen HOST-typed through this key (framework-slim §3.2): a
 * component cannot know how the app composed its host, so `i18n.core`
 * exposes only the capability-free `WrapperI18nHost` surface here and
 * `i18n.core.reloadTranslations(...)` is a compile error. Components acquire
 * capabilities through `useI18nLoader()` / `useI18nPlugins()`, which check
 * for them; the exact host type `C` survives only where the factory result
 * is held.
 */
export const I18N_INJECTION_KEY: InjectionKey<AnyVueI18n> = Symbol("i18n");
