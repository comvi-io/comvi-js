// Comvi i18n core exports (framework-agnostic)
// Root-entry ambient tag registration (Principle 1: string-API tag
// interpolation keeps working with zero imports beyond the root).
import "./register-tags";

export { createI18n, I18n } from "./core/full";
export { TranslationCache } from "./core/TranslationCache";

// Utility exports
export { createBoundTranslation } from "./utils/createBoundTranslation";
export { translationResultToString } from "./utils/translationResultToString";
export { subscribeToRevision, REVISION_EVENTS } from "./utils/subscribeToRevision";
export type { RevisionEvent, RevisionEventSource } from "./utils/subscribeToRevision";

// Tree-shakeable Intl formatting helpers
export {
  formatNumber,
  formatDate,
  formatCurrency,
  formatRelativeTime,
  getTextDirection,
} from "./format";
export type { LocaleSource } from "./format";

// Type exports
export type * from "./types";
export type {
  VirtualNode,
  ElementNode,
  TextNode,
  FragmentNode,
  TranslationResult,
} from "./virtualNode";

// VirtualNode helpers for tag interpolation
export { createElement, isVirtualNode } from "./virtualNode";

// Plugin system - only export types for plugin development
export type { I18nPlugin, I18nPluginFactory, PluginOptions } from "./plugins/types";
