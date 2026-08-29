"use client";

// ICU has TWO shapes: an INLINE constructor catalog takes `compiler:
// icuCompiler` in the same call, a REMOTE one takes `.with(icu())`, which must
// run BEFORE the first catalog reaches the host. The host locks its compiler at
// that first ingestion, so a later `icu()` throws `E_COMPILER_LOCKED` —
// `createI18n({ translation }).with(icu())` is invalid by construction.
// Composing a loader is not ingestion, so `icu()` and `loader()` chain in either
// order.

export {
  useI18n,
  useI18nContext,
  useI18nLoader,
  useI18nPlugins,
  useLocale,
  useIsLoading,
  useSetLocaleTransition,
  useFormatters,
  T,
} from "@comvi/react";

// Straight from core, NOT through @comvi/react's re-export of it: webpack in
// development mode reconnects a single `export … from` through a
// `sideEffects: false` package, but not a two-package chain, so the client
// bundle of an app that never calls `createI18n` kept the whole react entry
// alive.
export { createI18n } from "@comvi/core";

// Each is a named binding under `sideEffects: false`, so the ones an app does
// not call cost it zero. `@comvi/core/tags` is deliberately absent: it is the one
// side-effectful subpath. `<T>` reaches `@comvi/core/rich-text` through React
// and passes syntax per call, so importing or rendering it never registers
// string-API tag syntax ambiently.
// `loader()` / `plugins()` / `devtools()` are the CONFIGURED installers for
// `i18n.with(…)`: one expression composes and configures a capability; the
// `attach*` functions stay as the low-level API.
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

// Syncs the locale across the hydration boundary.
export { I18nProvider } from "./client/I18nProvider";
export type { I18nProviderProps, MessagesMap } from "./client/I18nProvider";
