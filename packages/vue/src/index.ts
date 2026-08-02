// Re-export everything from core
export * from "@comvi/core";

// Export Vue-specific bindings
export { VueI18n } from "./VueI18n";
export { createI18n } from "./createI18n";
export { createI18nFromCore } from "./createI18nFromCore";
export { useI18n } from "./composables/useI18n";
export type { UseI18nReturn } from "./composables/useI18n";
export { useI18nLoader, useI18nPlugins } from "./composables/capabilities";
export type { UseI18nLoaderReturn, UseI18nPluginsReturn } from "./composables/capabilities";
export { T } from "./components/T";
export { I18N_INJECTION_KEY } from "./keys";

// Re-export types
export type {
  VueI18n as I18nInstance,
  VueI18nOptions,
  VueI18nCoreOptions,
  AnyVueI18n,
} from "./VueI18n";
