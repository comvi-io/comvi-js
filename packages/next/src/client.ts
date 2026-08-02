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
} from "@comvi/react";

// framework-slim 0.5.0: `createI18n` comes straight from core, not through
// @comvi/react's own re-export of it. Same binding, same public API, one hop
// fewer — and that hop mattered: webpack in development mode reconnects a
// single `export … from` through a `sideEffects: false` package, but not a
// two-package chain, so the client bundle of an app that never calls
// `createI18n` kept core's root entry alive and with it the side-effectful
// tag-registration chunk (bundler-matrix case `next-client-slim`).
export { createI18n } from "@comvi/core";

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
