// `@comvi/react` — THE entry. One package specifier for a whole react app:
// the host constructor, the bindings, and the capability toolkit.
//
// There is no second entry and no second build pass. A framework user never
// has to name `@comvi/core` — which is the point: one specifier is the whole
// DX story. And because the package has exactly ONE chunk graph, it has
// exactly ONE React context: the "an `I18nProvider` from one entry and a
// `useI18n()` from the other cannot see each other" hazard that the second
// subpath build used to create is gone by construction, not by documentation.
//
// This entry DOES reach core's root, on purpose: `createI18n` and `I18n` below
// are the pure BASE host's own factory and class, re-exported by name. What no
// module in this package names — not this entry, not `<T>` — is
// `@comvi/core/tags`, the one side-effectful subpath (below); the capability
// subpaths it does name are pure named bindings, so the ones an app never
// calls stay out of a graph that did not ask for them.
//
// TWO RULES this file exists to keep, both learned by measurement:
//
//   1. NAMED re-exports only, never `export *`. A star re-export is a name set
//      webpack can only resolve by keeping the source module, and
//      `optimization.usedExports` is off in development — that is exactly how
//      `@comvi/vue`'s `export * from "@comvi/core"` kept the whole core root
//      entry alive in webpack dev, back when that root was the composed,
//      tag-registering one (fs-p4 §2 / abort P4-AB1). The rule outlived the
//      graph it was measured on: a star re-export still pins every module it
//      names. `export type *` is erased before any bundler sees it and is
//      therefore fine.
//   2. ONE hop, and never through another wrapper: webpack development
//      reconnects a single `export … from` across one `sideEffects: false`
//      package, but not a two-package chain (fs-p5, `@comvi/next/client`).
//      So every core binding below comes straight from `@comvi/core` or one
//      of its pure subpaths, never relayed through another `@comvi/*`.
//
// `@comvi/core/tags` is deliberately NOT re-exported, and nothing here imports
// it either: it is the one side-effectful subpath, so naming it would put
// ambient tag registration in every graph. `<T>` renders rich text through the
// PURE `@comvi/core/rich-text` seam, which passes the tag grammar per call, and
// lives in its own dist chunk so an app that never renders it pays nothing.
// Turning tag syntax on for plain string-API `t()` stays the app's own call.

// THE ONE-EXPRESSION QUICKSTART — this is the shape to reach for:
//
// ```ts
// import { createI18n, icuCompiler, loader } from "@comvi/react";
//
// const i18n = createI18n({ locale: "en", compiler: icuCompiler })
//   .with(loader({ uk: () => import("./uk.json") }));
// ```
//
// `.with(installer)` is core's composition pipe (it is just `installer(i18n)`),
// and `loader()` / `plugins()` / `devtools()` below are the configured
// installers it takes. ICU is the one capability with TWO shapes, both named
// here: an inline constructor catalog takes the COMPILER in the same call
// (`compiler: icuCompiler`), and a remote catalog takes the INSTALLER,
// `.with(icu())`, which must run before the first catalog reaches the host — a
// constructor `translation`, an `addTranslations` call, or a loader merge. The
// host locks its compiler there and a later `icu()` throws
// `E_COMPILER_LOCKED`. Composing a loader is not ingestion, so the order of
// `icu()` and `loader()` in one chain does not matter. Neither shape makes an
// app name `@comvi/core/icu`.

// The host: core's BASE `createI18n` and the `I18n` class behind it,
// re-exported by name so a react app has one import specifier. There is no
// react-side wrapper object to build (the instance goes straight into
// `<I18nProvider i18n={…}>`), so a hand-written preset here would be a rename
// and nothing else.
export { createI18n, I18n } from "@comvi/core";

// The react bindings.
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

// The capability toolkit, from core's pure subpaths. Each is a named binding
// under `sideEffects: false`, so the ones an app does not call cost it zero.
//
// `loader()` / `plugins()` / `devtools()` are the CONFIGURED installers for
// `i18n.with(…)`: one expression composes and configures a capability. The
// `attach*` functions stay as the low-level API — and are themselves valid
// installers, so `.with(attachLoader)` works too.
export { icu, icuCompiler } from "@comvi/core/icu";
export type { CompilerLockedError } from "@comvi/core/icu";
export { attachLoader, flattenCatalog, loader } from "@comvi/core/loader";
export { attachPlugins, plugins } from "@comvi/core/plugins";
export { attachDevtools, devtools } from "@comvi/core/devtools";

// Type vocabulary. `export type *` emits no JavaScript, so it is not a star
// re-export as far as any bundler is concerned.
export type * from "@comvi/core";
export type { DevtoolsOptions } from "@comvi/core/devtools";
