"use client";

// Re-export hooks and components from @comvi/react
export {
  useI18n,
  useI18nContext,
  // framework-slim 0.5.0: the client inherits react's D' surface unchanged —
  // the four capability members left useI18n() for these two hooks.
  useI18nLoader,
  useI18nPlugins,
  useLocale,
  useIsLoading,
  useSetLocaleTransition,
  useFormatters,
  T,
  createI18n,
} from "@comvi/react";

export type {
  UseI18nReturn,
  UseI18nLoaderReturn,
  UseI18nPluginsReturn,
  UseSetLocaleTransitionReturn,
  UseFormattersReturn,
  TProps,
} from "@comvi/react";

// Next.js-specific I18nProvider (handles locale syncing for hydration)
export { I18nProvider } from "./client/I18nProvider";
export type { I18nProviderProps, MessagesMap } from "./client/I18nProvider";
