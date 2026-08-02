// Re-export everything from core
export { createI18n, I18n } from "@comvi/core";
export type * from "@comvi/core";

// Export Svelte-specific bindings.
//
// Relative specifiers carry the emitted `.js` extension: `svelte-package`
// copies them verbatim into `dist`, and `@comvi/svelte` is `"type": "module"`,
// so webpack (and Node's own ESM resolver) treat an extensionless request as
// unresolvable — "fully specified" is the rule for strict ESM.
export { setI18nContext, getI18nContext } from "./context.js";
export type { SetI18nContextOptions } from "./context.js";
export { useI18n } from "./useI18n.js";
export type {
  SvelteRawTranslationFunction,
  SvelteTextTranslationFunction,
  UseI18nReturn,
} from "./useI18n.js";

// Capability-segregated acquisition (plan §3.2): the loader/plugin-host
// members that left `useI18n()` in 0.5.0. Context readers, NOT stores.
export { useI18nLoader, useI18nPlugins } from "./capabilities.js";
export type { UseI18nLoaderReturn, UseI18nPluginsReturn } from "./capabilities.js";

// Export types
export type { ComponentMap, ComponentMapping, TProps } from "./types";

// Export stores for advanced usage
export {
  createLocaleStore,
  createLoadingStore,
  createInitializingStore,
  createInitializedStore,
  createCacheRevisionStore,
  createDefaultParamsStore,
} from "./stores.js";

// Export T component
export { default as T } from "./T.svelte";
