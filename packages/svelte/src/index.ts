// Re-export everything from core
export { createI18n, I18n } from "@comvi/core";
export type * from "@comvi/core";

// Export Svelte-specific bindings
export { setI18nContext, getI18nContext } from "./context";
export type { SetI18nContextOptions } from "./context";
export { useI18n } from "./useI18n";
export type { UseI18nReturn } from "./useI18n";

// Export types
export type { ComponentMap, ComponentMapping } from "./types";

// Export stores for advanced usage
export {
  createLanguageStore,
  createLoadingStore,
  createInitializingStore,
  createInitializedStore,
  createCacheRevisionStore,
} from "./stores";

// Export T component
export { default as T } from "./T.svelte";
