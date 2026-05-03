// Re-export everything from core
export { createI18n, I18n } from "@comvi/core";
export type * from "@comvi/core";

// Export SolidJS-specific bindings
export { I18nProvider, useI18nContext } from "./context";
export type { I18nProviderProps } from "./context";

export { useI18n } from "./useI18n";
export type { UseI18nReturn } from "./useI18n";

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
