// TWO RULES this file exists to keep:
//
//   1. NAMED re-exports only, never `export *` — webpack development can only
//      resolve a star re-export by keeping the source module alive. (`export
//      type *` is erased before any bundler sees it and is fine.)
//   2. ONE hop, never through another wrapper: webpack development reconnects a
//      single `export … from` across one `sideEffects: false` package, but not
//      a two-package chain.
//
// `@comvi/core/tags` is deliberately NOT re-exported, and nothing here imports
// it either: it is the one side-effectful subpath, so naming it would put
// ambient tag registration in every graph.

export { createI18n, I18n } from "@comvi/core";

export { I18nProvider, useI18nContext, useLocale, useIsLoading } from "./I18nProvider";
export type { I18nProviderProps } from "./I18nProvider";
export { useI18n } from "./useI18n";
export type { UseI18nReturn } from "./useI18n";
export { useI18nLoader, useI18nPlugins } from "./capabilityHooks";
export type { UseI18nLoaderReturn, UseI18nPluginsReturn } from "./capabilityHooks";
export { useSetLocaleTransition } from "./useSetLocaleTransition";
export type { UseSetLocaleTransitionReturn } from "./useSetLocaleTransition";
export { useFormatters } from "./useFormatters";
export type { UseFormattersReturn } from "./useFormatters";
export { T } from "./T";
export type { TProps } from "./T";

// Each is a named binding under `sideEffects: false`, so the subpaths an app
// never calls stay out of its graph.
export { icu, icuCompiler } from "@comvi/core/icu";
export type { CompilerLockedError } from "@comvi/core/icu";
export { attachLoader, flattenCatalog, loader } from "@comvi/core/loader";
export { attachPlugins, plugins } from "@comvi/core/plugins";
export { attachDevtools, devtools } from "@comvi/core/devtools";

export type * from "@comvi/core";
export type { DevtoolsOptions } from "@comvi/core/devtools";
