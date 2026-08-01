// @comvi/core/slim — pay-for-what-you-use entry.
//
// Text + `{param}` interpolation only; no ICU plural/select machinery and no
// tag syntax in the module graph. ICU behavior can be injected back per
// instance: `createI18n({ ..., compiler: icuCompiler })` with `icuCompiler`
// from the pure `@comvi/core/icu` subpath. Tag syntax comes from
// `@comvi/core/tags` (ambient) or per call via `tagInterpolation.extensions`.
import { createI18nWithCompiler } from "./core/factory";
import { simpleCompiler } from "./core/translate/compile-simple";

export const createI18n = createI18nWithCompiler(simpleCompiler);

export { TranslationCache } from "./core/TranslationCache";
export { createBoundTranslation } from "./utils/createBoundTranslation";
export { translationResultToString } from "./utils/translationResultToString";
export { createImportMapLoader } from "./core/importMapLoader";
export type { LoaderImportMap, LoaderImportResult } from "./core/importMapLoader";

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
export type { I18n } from "./core/i18n";
export type { FactoryI18nOptions } from "./core/factory";
export type { MessageCompiler, SyntaxExtension } from "./core/translate/syntax";
export type * from "./types";
export type {
  VirtualNode,
  ElementNode,
  TextNode,
  FragmentNode,
  TranslationResult,
} from "./virtualNode";

// Plugin system - only export types for plugin development
export type { I18nPlugin, I18nPluginFactory, PluginOptions } from "./plugins/types";
