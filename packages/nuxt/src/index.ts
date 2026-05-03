// Main module export
export { default } from "./module";

// Type exports
export type {
  NuxtI18nOptions,
  LocaleObject,
  LocalePrefixMode,
  DetectBrowserLanguageOptions,
  ResolvedRoutingConfig,
  NuxtI18nRuntimeConfig,
  NuxtI18nPrivateRuntimeConfig,
  NuxtI18nSetupContext,
  NuxtI18nSetup,
  // Re-exported from core
  TranslationParams,
  TranslationResult,
  TranslationKeys,
  I18n,
} from "./types";

// Re-export T component type from Vue
export type { T } from "@comvi/vue";
