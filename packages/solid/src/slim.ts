// `@comvi/solid/slim` — the single-package, star-free entry.
//
// One import specifier for a whole slim solid app: the host constructor, the
// bindings, and the capability toolkit. A framework user never has to name
// `@comvi/core` — which is the point: one specifier is the whole DX story.
// This entry DOES reach core's root, on purpose: `createI18n` below is the
// pure BASE host's own constructor, re-exported by name. What it never names
// is `@comvi/core/tags`, the one side-effectful subpath (below); the
// capability subpaths it does name are pure named bindings, so the ones an app
// never calls stay out of a graph that did not ask for them.
//
// TWO RULES this file exists to keep, both learned by measurement:
//
//   1. NAMED re-exports only, never `export *`. A star re-export is a name set
//      webpack can only resolve by keeping the source module, and
//      `optimization.usedExports` is off in development — that is exactly how
//      `@comvi/vue`'s `export * from "@comvi/core"` kept the whole root entry
//      alive in webpack dev, back when that root was the composed,
//      tag-registering one (fs-p4 §2 / abort P4-AB1). The rule outlived the
//      graph it was measured on: a star re-export still pins every module it
//      names. `export type *` is erased before any bundler sees it and is
//      therefore fine.
//   2. ONE hop, and never through another wrapper: webpack development
//      reconnects a single `export … from` across one `sideEffects: false`
//      package, but not a two-package chain (fs-p5, `@comvi/next/client`).
//      So every core binding below comes straight from `@comvi/core` or one
//      of its pure subpaths, never relayed through `@comvi/solid`.
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
// The host constructor: the pure BASE root's own `createI18n` from
// `@comvi/core`, re-exported so a solid app has one import specifier. There is
// no solid-side wrapper object to build (the instance goes straight into
// `<I18nProvider i18n={…}>`), so a hand-written preset here would be a rename
// and nothing else.
export { createI18n } from "@comvi/core";

// The bindings — identical to `@comvi/solid`. The only root value that entry
// carries and this one does not is core's `I18n` class.
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
export type * from "@comvi/core";
export type { DevtoolsOptions } from "@comvi/core/devtools";
