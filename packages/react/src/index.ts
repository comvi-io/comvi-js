// Re-export everything from core
export { createI18n, I18n } from "@comvi/core";
export type * from "@comvi/core";

// Export React-specific bindings
export { I18nProvider, useI18nContext, useLocale, useIsLoading } from "./I18nProvider";
export type { I18nProviderProps } from "./I18nProvider";
export { useI18n } from "./useI18n";
export type { UseI18nReturn } from "./useI18n";
export { useSetLocaleTransition } from "./useSetLocaleTransition";
export type { UseSetLocaleTransitionReturn } from "./useSetLocaleTransition";
export { useFormatters } from "./useFormatters";
export type { UseFormattersReturn } from "./useFormatters";
export { T } from "./T";
export type { TProps } from "./T";
