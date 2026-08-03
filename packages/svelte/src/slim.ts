// `@comvi/svelte/slim` — the single-package, root-free entry.
//
// One import specifier for a whole slim svelte app: the host constructor, the
// bindings, and the capability toolkit. A framework user never has to name
// `@comvi/core` — which is the point: the root entry is side-effectful
// (ambient `registerTagSyntax()`), so every extra reason to reach for it is a
// chance to pull the tag graph back in.
//
// TWO RULES this file exists to keep, both learned by measurement:
//
//   1. NAMED re-exports only, never `export *`. A star re-export is a name set
//      webpack can only resolve by keeping the source module, and
//      `optimization.usedExports` is off in development — that is exactly how
//      `@comvi/vue`'s `export * from "@comvi/core"` kept the root entry alive
//      in webpack dev (fs-p4 §2 / abort P4-AB1). `export type *` is erased
//      before any bundler sees it and is therefore fine.
//   2. Re-export from core's PURE subpaths, never from `@comvi/core`, and
//      never through another wrapper: webpack development reconnects a single
//      `export … from` across one `sideEffects: false` package, but not a
//      two-package chain (fs-p5, `@comvi/next/client`).
//
// `@comvi/core/tags` is deliberately NOT re-exported: it is the one
// side-effectful subpath, so naming it here would put ambient tag
// registration in every graph. `<T>` owns that import and lives in its own
// dist module so an app that never renders it pays nothing.
//
// Unlike react/solid/vue, `svelte-package` preserves modules, so this entry
// and `@comvi/svelte` share every binding module: mixing the two specifiers
// is byte-wasteful but not broken — the context key is one object either way.
//
// Relative specifiers carry the emitted `.js` extension: `svelte-package`
// copies them verbatim into `dist`, and `@comvi/svelte` is `"type": "module"`,
// so webpack (and Node's own ESM resolver) treat an extensionless request as
// unresolvable — "fully specified" is the rule for strict ESM.

// The host constructor: `@comvi/core/slim`'s own `createI18n`, re-exported so
// a svelte app has one import specifier. There is no svelte-side wrapper
// object to build (the instance goes straight into `setI18nContext({ i18n })`),
// so a hand-written preset here would be a rename and nothing else.
export { createI18n } from "@comvi/core/slim";

// The bindings — identical to `@comvi/svelte`, minus the root re-exports.
export { setI18nContext, getI18nContext } from "./context.js";
export type { SetI18nContextOptions } from "./context.js";
export { useI18n } from "./useI18n.js";
export type {
  SvelteRawTranslationFunction,
  SvelteTextTranslationFunction,
  UseI18nReturn,
} from "./useI18n.js";
export { useI18nLoader, useI18nPlugins } from "./capabilities.js";
export type { UseI18nLoaderReturn, UseI18nPluginsReturn } from "./capabilities.js";
export type { ComponentMap, ComponentMapping, TProps } from "./types";
export {
  createLocaleStore,
  createLoadingStore,
  createInitializingStore,
  createInitializedStore,
  createCacheRevisionStore,
  createDefaultParamsStore,
} from "./stores.js";
export { default as T } from "./T.svelte";

// The capability toolkit, from core's pure subpaths. Each is a named binding
// under `sideEffects: false`, so the four an app does not call cost it zero.
export { icuCompiler } from "@comvi/core/icu";
export { attachLoader, flattenCatalog } from "@comvi/core/loader";
export { attachPlugins } from "@comvi/core/plugins";
export { attachDevtools } from "@comvi/core/devtools";

// Type vocabulary. `export type *` emits no JavaScript, so it is not a star
// re-export as far as any bundler is concerned.
export type * from "@comvi/core/slim";
export type { DevtoolsOptions } from "@comvi/core/devtools";
