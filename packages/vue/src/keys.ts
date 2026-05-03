import type { InjectionKey } from "vue";
import type { VueI18n } from "./VueI18n";

/**
 * Injection key for Vue's provide/inject pattern
 * Used to inject the i18n instance into Vue components
 */
export const I18N_INJECTION_KEY: InjectionKey<VueI18n> = Symbol("i18n");
