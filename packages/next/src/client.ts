"use client";

// ICU has ONE shape, whatever the catalog source: `compiler: icuCompiler` in
// the `createI18n` options. It is a compiler setting read in the constructor,
// so it imposes no ordering on `.use(…)` composition.

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
// `loader(map)` / `plugins()` / `devtools()` are the CONFIGURED installers for
// `i18n.use(…)`: one expression composes and configures a capability; `attachLoader`
// stays as the low-level API (the `plugins`/`devtools` counterparts live on
// `@comvi/core/plugins` and `@comvi/core/devtools` for advanced use).
export { icuCompiler } from "@comvi/core/icu";
export { attachLoader, loader } from "@comvi/core/loader";
export { definePlugin, plugins } from "@comvi/core/plugins";
export { devtools } from "@comvi/core/devtools";
export type { DevtoolsOptions } from "@comvi/core/devtools";
// The Next-scoped plugin installers: `runtime` / `environment` on the PLUGIN,
// composed with the same `.use(…)` as everything above.
export { nextPlugin, nextPluginLazy } from "./nextPlugin";
export type { NextPluginOptions, LazyPluginModule, LazyPluginLoader } from "./nextPlugin";

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
