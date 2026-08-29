// THREE RULES this file exists to keep:
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
//   3. Relative specifiers carry the emitted `.js` extension: `svelte-package`
//      copies them verbatim into `dist`, and `@comvi/svelte` is
//      `"type": "module"`, so webpack (and Node's own ESM resolver) treat an
//      extensionless request as unresolvable — "fully specified" is the rule
//      for strict ESM.
//
// `@comvi/core/tags` is deliberately NOT re-exported, and nothing here imports
// it either: it is the one side-effectful subpath, so naming it would put
// ambient tag registration in every graph.

export { createI18n, I18n } from "@comvi/core";

export { setI18nContext, getI18nContext } from "./context.js";
export type { SetI18nContextOptions } from "./context.js";
export { useI18n } from "./useI18n.js";
export type {
  SvelteRawTranslationFunction,
  SvelteTextTranslationFunction,
  UseI18nReturn,
} from "./useI18n.js";

// Context readers, NOT stores.
export { useI18nLoader, useI18nPlugins } from "./capabilities.js";
export type { UseI18nLoaderReturn, UseI18nPluginsReturn } from "./capabilities.js";

export {
  createLocaleStore,
  createLoadingStore,
  createInitializingStore,
  createInitializedStore,
  createCacheRevisionStore,
  createDefaultParamsStore,
} from "./stores.js";

export { default as T } from "./T.svelte";
export type { ComponentMap, ComponentMapping, TProps } from "./types";

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
