// Main entry - re-exports from core and common types
export { createI18n, I18n } from "@comvi/core";
export type * from "@comvi/core";

// Factory function for simplified setup
export { createNextI18n } from "./createNextI18n";
export type {
  CreateNextI18nOptions,
  CreateNextI18nResult,
  UsePluginOptions,
  ScopedPluginOptions,
  LazyPluginModule,
  LazyPluginLoader,
} from "./createNextI18n";

// The exact composed host type `createNextI18n` returns (plan §2.6). Published
// so a consumer can name the type of `result.i18n` without reaching for
// `CreateNextI18nResult<D>["i18n"]`.
export type { NextComposedI18n } from "./composedHost";

// Re-export types from submodules
export type { RoutingConfig, LocalePrefixMode } from "./routing/types";
export type { MiddlewareConfig } from "./middleware/types";
export type { GetI18nOptions } from "./server/types";
export type { I18nProviderProps } from "./client/I18nProvider";
