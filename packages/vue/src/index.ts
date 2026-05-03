// Re-export everything from core
export * from "@comvi/core";

// Export Vue-specific bindings
export { VueI18n, createI18n } from "./VueI18n";
export { useI18n } from "./composables/useI18n";
export { T } from "./components/T";
export { I18N_INJECTION_KEY } from "./keys";

// Re-export types
export type { VueI18n as I18nInstance, VueI18nOptions } from "./VueI18n";
