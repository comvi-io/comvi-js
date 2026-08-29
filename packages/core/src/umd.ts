// NON-EXPORTED CDN/global entry — absent from package.json#exports.
//
// A `<script src>` consumer has no import graph to extend, so the global stays
// BATTERIES-INCLUDED where the ESM root is the bare base host. That is the one
// deliberate ESM-vs-global format exception, and the composition lives here:
// ambient tag syntax, plus the composed host (ICU compiler + loader + plugin
// host + devtools discovery) so `new ComviCore.I18n(options)` accepts the
// `exposeGlobal` / `instanceId` options and the import-map `registerLoader`
// overload.
import "./register-tags";

export { createI18n, I18n } from "./core/full";
export { TranslationCache } from "./core/TranslationCache";
export { flattenCatalog } from "./core/loader";
export { createBoundTranslation } from "./utils/createBoundTranslation";
export { translationResultToString } from "./utils/translationResultToString";
export { subscribeToRevision, REVISION_EVENTS } from "./utils/subscribeToRevision";
export { missingCapability, hasLoaderApi, hasPluginHostApi } from "./utils/capability";
export {
  formatNumber,
  formatDate,
  formatCurrency,
  formatRelativeTime,
  getTextDirection,
} from "./format";
export { createElement, isVirtualNode } from "./virtualNode";
export { icuCompiler } from "./core/translate/compile-icu";
export { registerTagSyntax, tagSyntaxExtension } from "./core/translate/tags";
export { prepareTranslation } from "./core/prepareTranslation";

export type * from "./types";
export type { I18n as I18nClass } from "./core/i18n";
export type { MessageCompiler, SyntaxExtension } from "./core/translate/syntax";
export type { I18nPlugin, I18nPluginFactory, PluginOptions } from "./plugins/types";
