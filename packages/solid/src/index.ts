// Re-export everything from core
export { createI18n, I18n } from "@comvi/core";
export type * from "@comvi/core";

// Export SolidJS-specific bindings
export { I18nProvider, useI18nContext } from "./context";
export type { I18nProviderProps } from "./context";

export { useI18n } from "./useI18n";
export type { UseI18nReturn } from "./useI18n";

// Capability-segregated acquisition (plan §3.2): the loader/plugin-host
// members that left `useI18n()` in 0.5.0.
export { useI18nLoader, useI18nPlugins } from "./capabilityHooks";
export type { UseI18nLoaderReturn, UseI18nPluginsReturn } from "./capabilityHooks";

// Export T component
export { T } from "./T";
export type { TProps } from "./T";

// Export types
export type { ComponentMap } from "./types";

// Export primitives for advanced usage
export {
  createLocaleSignal,
  createDefaultNamespaceSignal,
  createLoadingSignal,
  createInitializingSignal,
  createInitializedSignal,
  createCacheRevisionSignal,
} from "./primitives";
