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
// `createI18n` kept the whole root entry alive — and back when that root was
// the composed one, its side-effectful tag-registration chunk with it
// (bundler-matrix case `next-client-slim`).
export { createI18n } from "@comvi/core";

// The same base host under next's second published name (framework-slim DX
// pass).
//
// `@comvi/next/client` is next's only client surface, and it is not a `/slim`
// entry. `createI18n` above is the published 0.4.x name; `createSlimI18n` was
// added for the bare host rather than rebinding that name, because rebinding
// would have dropped ICU plurals and tag syntax out from under an existing
// app. The single-entry convergence in `@comvi/core` then made the bare host
// THE host, so both names denote the same base constructor and this one is a
// duplicate — a later phase deletes it and codemods the name. Everything else
// about the single-package promise is identical to `@comvi/react/slim`: the
// capability toolkit below means a next client app never has to name
// `@comvi/core`.
//
// A client host cannot load — the loader lives on the server companion
// (`@comvi/next/server`) — so the recipe is: construct, then hydrate from the
// catalog the server serialized.
//
// ```tsx
// "use client";
// import { createSlimI18n, I18nProvider } from "@comvi/next/client";
//
// const i18n = createSlimI18n({ locale: "en", defaultNs: "default" });
// <I18nProvider i18n={i18n} locale={locale} messages={messages}>…</I18nProvider>
// ```
export { createI18n as createSlimI18n } from "@comvi/core";

// The capability toolkit, from core's PURE subpaths — one hop, never through
// `@comvi/react` (webpack development reconnects a single `export … from`
// across one `sideEffects: false` package, but not a two-package chain: that
// is why `createI18n` above comes straight from core). Each is a named
// binding under `sideEffects: false`, so the ones an app does not call cost
// it zero. `@comvi/core/tags` is deliberately absent: it is the one
// side-effectful subpath, and `<T>` already owns that import.
// `loader()` / `plugins()` / `devtools()` are the CONFIGURED installers for
// `i18n.with(…)`: one expression composes and configures a capability; the
// `attach*` functions stay as the low-level API.
export { icuCompiler } from "@comvi/core/icu";
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
