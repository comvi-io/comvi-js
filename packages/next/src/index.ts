export { createI18n, I18n } from "@comvi/core";
export type * from "@comvi/core";

export { createNextI18n } from "./createNextI18n";
export type {
  CreateNextI18nOptions,
  CreateNextI18nResult,
  UseInstanceIdentityError,
} from "./createNextI18n";

// The two Next-scoped installers for `result.use(…)`, beside the factory
// whose result they are written for.
export { nextPlugin, nextPluginLazy } from "./nextPlugin";
export type { NextPluginOptions, LazyPluginModule, LazyPluginLoader } from "./nextPlugin";

// The same capability toolkit `/client` and `/server` carry, so a shared
// `i18n/config.ts` — imported by BOTH runtimes, which rules out the
// `"use client"` entry and the `next/headers`-bound one — composes onto
// `createNextI18n(…)` from this one specifier. The composed root reaches every
// subpath already, so re-exporting them here costs its graph nothing; under
// `sideEffects: false` the names an app does not call are pruned.
export { icuCompiler } from "@comvi/core/icu";
export { attachLoader, loader } from "@comvi/core/loader";
export { definePlugin, plugins } from "@comvi/core/plugins";
export { devtools } from "@comvi/core/devtools";
export type { DevtoolsOptions } from "@comvi/core/devtools";

// Published so a consumer can name the type of `result.i18n` without reaching
// for `CreateNextI18nResult<D>["i18n"]`.
export type { NextComposedI18n } from "./composedHost";

export type { RoutingConfig, LocalePrefixMode } from "./routing/types";
export type { MiddlewareConfig } from "./middleware/types";
export type { GetI18nOptions } from "./server/types";
export type { I18nProviderProps } from "./client/I18nProvider";
