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

// The SLIM client host, in one call and one package (framework-slim DX pass).
//
// `@comvi/next/client` is next's only client surface, and it is not a
// `/slim` entry: `createI18n` above is the published 0.4.x binding and stays
// the ROOT constructor, because silently swapping it for the slim one would
// drop ICU plurals and tag syntax out from under an existing app. So the slim
// host gets its own name. Everything else about the single-package promise is
// identical to `@comvi/react/slim`: the capability toolkit below means a next
// client app never has to name `@comvi/core`.
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
export { createI18n as createSlimI18n } from "@comvi/core/slim";

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
