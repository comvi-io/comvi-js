// TWO RULES this file exists to keep:
//
//   1. NAMED re-exports only, never `export *`. A star re-export is a name set
//      webpack can only resolve by keeping the source module, and
//      `optimization.usedExports` is off in development — that is how
//      `@comvi/vue`'s `export * from "@comvi/core"` once kept the whole core
//      root entry alive in webpack dev. `export type *` is erased before any
//      bundler sees it and is therefore fine.
//   2. ONE hop, and never through another wrapper: webpack development
//      reconnects a single `export … from` across one `sideEffects: false`
//      package, but not a two-package chain. So every core binding below comes
//      straight from `@comvi/core` or one of its pure subpaths, never relayed
//      through another `@comvi/*`.
//
// `@comvi/core/tags` is deliberately NOT re-exported, and nothing here imports
// it either: it is the one side-effectful subpath, so naming it would put
// ambient tag registration in every graph.

export { createI18n, I18n } from "@comvi/core";

export { I18nProvider, useI18nContext } from "./context";
export type { I18nProviderProps } from "./context";
export { useI18n } from "./useI18n";
export type { UseI18nReturn } from "./useI18n";

export { useI18nLoader, useI18nPlugins } from "./capabilityHooks";
export type { UseI18nLoaderReturn, UseI18nPluginsReturn } from "./capabilityHooks";

export { T } from "./T";
export type { TProps } from "./T";
export type { ComponentMap } from "./types";

export {
  createLocaleSignal,
  createDefaultNamespaceSignal,
  createLoadingSignal,
  createInitializingSignal,
  createInitializedSignal,
  createCacheRevisionSignal,
} from "./primitives";

// The capability toolkit. Each is a named binding under `sideEffects: false`,
// so the subpaths an app never calls stay out of its graph. `loader()` /
// `plugins()` / `devtools()` are the configured installers for `i18n.with(…)`;
// the `attach*` functions are themselves installers, so `.with(attachLoader)`
// works too.
export { icu, icuCompiler } from "@comvi/core/icu";
export type { CompilerLockedError } from "@comvi/core/icu";
export { attachLoader, flattenCatalog, loader } from "@comvi/core/loader";
export { attachPlugins, plugins } from "@comvi/core/plugins";
export { attachDevtools, devtools } from "@comvi/core/devtools";

export type * from "@comvi/core";
export type { DevtoolsOptions } from "@comvi/core/devtools";
