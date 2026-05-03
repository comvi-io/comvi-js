// Main entry - re-exports from core and common types
export { createI18n, I18n } from "@comvi/core";
export type * from "@comvi/core";

// Factory function for simplified setup
export { createNextI18n } from "./createNextI18n";
export type { CreateNextI18nOptions, CreateNextI18nResult } from "./createNextI18n";

// Re-export types from submodules
export type { RoutingConfig, LocalePrefixMode } from "./routing/types";
export type { MiddlewareConfig } from "./middleware/types";
export type { GetI18nOptions } from "./server/types";
export type { I18nProviderProps } from "./client/I18nProvider";
