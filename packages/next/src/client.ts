"use client";

// `@comvi/next/client` — next's ONLY client surface. One specifier for a whole
// client component tree: the host constructor, react's bindings, and the
// capability toolkit.
//
// The client/server split here is a RUNTIME split, not a host-tier split:
// `@comvi/next/server` is the same surface for the SSR half, and neither entry
// is a `/slim`. A client host cannot load — the loader lives on the server
// companion — so the recipe is: construct, then hydrate from the catalog the
// server serialized.
//
// ```tsx
// "use client";
// import { createI18n, I18nProvider } from "@comvi/next/client";
//
// const i18n = createI18n({ locale: "en", defaultNs: "default" });
// <I18nProvider i18n={i18n} locale={locale} messages={messages}>…</I18nProvider>
// ```
//
// ICU is the one capability with TWO shapes, and which one is correct depends
// on where the catalog comes from: an INLINE constructor catalog takes the
// compiler in the same call (`compiler: icuCompiler`), because the constructor
// ingests it immediately; a REMOTE catalog takes the installer
// (`.with(icu())`), which must run before the first catalog reaches the host —
// a constructor `translation`, an `addTranslations` call, or a loader merge.
// The host locks its compiler there, so a later `icu()` throws with own
// `code === "E_COMPILER_LOCKED"` instead of silently doing nothing — which is
// why `createI18n({ translation }).with(icu())` is invalid by construction.
// Composing a loader is not ingestion, so the order of `icu()` and `loader()`
// in one chain does not matter.
// Both shapes are named on this entry, so neither makes a next app reach for
// `@comvi/core/icu`.

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

// THE host: core's base `createI18n`, straight from core and not through
// @comvi/react's own re-export of it. Same binding, one hop fewer — and that
// hop mattered: webpack in development mode reconnects a single
// `export … from` through a `sideEffects: false` package, but not a
// two-package chain, so the client bundle of an app that never calls
// `createI18n` kept the whole react entry alive — and back when core's root was
// the composed one, its side-effectful tag-registration chunk with it
// (bundler-matrix case `next-client-default`).
//
// This name is the published 0.4.x one and it now denotes the BASE host: ICU,
// tag syntax, the loader, the plugin host and devtools discovery are things a
// client app composes rather than things the constructor already carried. The
// single-entry convergence deleted the transitional second name that sat beside
// it for the bare host; the codemod renames it (§7.2-2).
export { createI18n } from "@comvi/core";

// The capability toolkit, from core's PURE subpaths — one hop, never through
// `@comvi/react` (webpack development reconnects a single `export … from`
// across one `sideEffects: false` package, but not a two-package chain: that
// is why `createI18n` above comes straight from core). Each is a named
// binding under `sideEffects: false`, so the ones an app does not call cost
// it zero. `@comvi/core/tags` is deliberately absent: it is the one
// side-effectful subpath. `<T>` reaches `@comvi/core/rich-text` through React
// and passes syntax per call, so importing or rendering it never registers
// string-API tag syntax ambiently.
// `loader()` / `plugins()` / `devtools()` are the CONFIGURED installers for
// `i18n.with(…)`: one expression composes and configures a capability; the
// `attach*` functions stay as the low-level API. `icu()` is the pre-ingestion
// compiler installer described above; `icuCompiler` is its constructor-option
// twin.
export { icu, icuCompiler } from "@comvi/core/icu";
export type { CompilerLockedError } from "@comvi/core/icu";
export { attachLoader, flattenCatalog, loader } from "@comvi/core/loader";
export { attachPlugins, plugins } from "@comvi/core/plugins";
export { attachDevtools, devtools } from "@comvi/core/devtools";
export type { DevtoolsOptions } from "@comvi/core/devtools";

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
