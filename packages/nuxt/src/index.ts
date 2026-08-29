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
  // The `hostModule` vocabulary. `NuxtServerHost` is the base host the server
  // utilities accept; `NuxtServerLoaderHost` is that host with
  // `@comvi/core/loader` composed on, which is what SSR translation loading
  // needs; `NuxtHostFactory` / `NuxtHostFactoryOptions` type the factory
  // itself.
  NuxtServerHost,
  NuxtServerLoaderHost,
  NuxtHostFactory,
  NuxtHostFactoryOptions,
  // Re-exported from core
  TranslationParams,
  TranslationResult,
  TranslationKeys,
  I18n,
} from "./types";

// Re-export T component type from Vue
export type { T } from "@comvi/vue";
