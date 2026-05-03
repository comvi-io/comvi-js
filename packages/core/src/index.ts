// Comvi i18n core exports (framework-agnostic)
export { createI18n, I18n } from "./core/i18n";
export { TranslationCache } from "./core/TranslationCache";

// Utility exports
export { createBoundTranslation } from "./utils/createBoundTranslation";
export { translationResultToString } from "./utils/translationResultToString";

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
export { createElement } from "./virtualNode";

// Plugin system - only export types for plugin development
export type { I18nPlugin, I18nPluginFactory, PluginOptions } from "./plugins/types";
