import type { InjectionKey } from "vue";
import type { AnyVueI18n } from "./VueI18n";

/**
 * The core is seen BASE-typed through this key: a component cannot know how
 * the app composed its instance, so `i18n.core` exposes only the capability-free
 * `WrapperI18nInstance` surface and `i18n.core.reloadMessages(...)` is a
 * compile error. Components acquire capabilities through `useI18nLoader()` /
 * `useI18nPlugins()`, which check for them; the exact instance type `C` survives
 * only where the factory result is held.
 */
export const I18N_INJECTION_KEY: InjectionKey<AnyVueI18n> = Symbol("i18n");
