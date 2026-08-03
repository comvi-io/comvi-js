// `@comvi/solid/slim` — the single-package, root-free entry.
//
// One import specifier for a whole slim solid app: the host constructor, the
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
// dist chunk so an app that never renders it pays nothing.
//
// Pick ONE entry per app. `@comvi/solid` and `@comvi/solid/slim` are separate
// builds, so their solid contexts are distinct objects — an `I18nProvider`
// from one and a `useI18n()` from the other will not see each other. This
// entry is a superset of the bindings, so there is never a reason to mix.

// THE ONE-EXPRESSION QUICKSTART — this is the shape to reach for:
//
// ```ts
// import { createI18n, icuCompiler, loader } from "@comvi/solid/slim";
//
// const i18n = createI18n({ locale: "en", compiler: icuCompiler })
//   .with(loader({ uk: () => import("./uk.json") }));
// ```
//
// `.with(installer)` is core's composition pipe (it is just `installer(i18n)`),
// and `loader()` / `plugins()` / `devtools()` below are the configured
// installers it takes.
//
// The host constructor: `@comvi/core/slim`'s own `createI18n`, re-exported so
// a solid app has one import specifier. There is no solid-side wrapper object
// to build (the instance goes straight into `<I18nProvider i18n={…}>`), so a
// hand-written preset here would be a rename and nothing else.
export { createI18n } from "@comvi/core/slim";

// The bindings — identical to `@comvi/solid`, minus the root re-exports.
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

// The capability toolkit, from core's pure subpaths. Each is a named binding
// under `sideEffects: false`, so the ones an app does not call cost it zero.
//
// `loader()` / `plugins()` / `devtools()` are the CONFIGURED installers for
// `i18n.with(…)`: one expression composes and configures a capability. The
// `attach*` functions stay as the low-level API — and are themselves valid
// installers, so `.with(attachLoader)` works too.
export { icuCompiler } from "@comvi/core/icu";
export { attachLoader, flattenCatalog, loader } from "@comvi/core/loader";
export { attachPlugins, plugins } from "@comvi/core/plugins";
export { attachDevtools, devtools } from "@comvi/core/devtools";

// Type vocabulary. `export type *` emits no JavaScript, so it is not a star
// re-export as far as any bundler is concerned.
export type * from "@comvi/core/slim";
export type { DevtoolsOptions } from "@comvi/core/devtools";
