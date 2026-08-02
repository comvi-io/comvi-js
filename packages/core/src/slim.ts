// @comvi/core/slim — pay-for-what-you-use entry.
//
// Text + `{param}` interpolation only; no ICU plural/select machinery and no
// tag syntax in the module graph. ICU behavior can be injected back per
// instance: `createI18n({ ..., compiler: icuCompiler })` with `icuCompiler`
// from the pure `@comvi/core/icu` subpath. Tag syntax comes from
// `@comvi/core/tags` (ambient) or per call via `tagInterpolation.extensions`.
//
// Capabilities live in their own pure subpaths and are composed onto an
// instance — they are absent from a bare slim instance by module graph, not
// by a runtime flag:
//   • `@comvi/core/loader`  — `attachLoader`: registerLoader / getLoader /
//     reloadTranslations, plus `createImportMapLoader` (moved here from
//     `/slim` in 0.5.0).
//   • `@comvi/core/plugins` — `attachPlugins`: use / locale detector /
//     missing-key callbacks / post-processor registration / plugin data.
// Compose outside-in: `attachPlugins(attachLoader(createI18n({ … })))`.
//
// In any graph without a tags extension (bare slim and slim + `/icu`),
// `<tag>…</tag>` is not syntax — it stays literal text in the output. Rich
// non-primitive param values behave exactly as on the root entry: `t` coerces
// them to a string, `tRaw` preserves them as a parts array.
import { createI18nWithCompiler } from "./core/factory";
import { simpleCompiler } from "./core/translate/compile-simple";

export const createI18n = createI18nWithCompiler(simpleCompiler);

export { TranslationCache } from "./core/TranslationCache";
export { createBoundTranslation } from "./utils/createBoundTranslation";
export { translationResultToString } from "./utils/translationResultToString";

// Wrapper enablers (framework-slim P1). Pure re-exports: a framework binding
// that reads reactivity events, sniffs virtual nodes, or reports an absent
// capability no longer has to reach for the root entry — which would drag
// the ambient `register-tags` side effect into every wrapper bundle.
export { subscribeToRevision, REVISION_EVENTS } from "./utils/subscribeToRevision";
export type { RevisionEvent, RevisionEventSource } from "./utils/subscribeToRevision";
export { isVirtualNode } from "./virtualNode";
export { missingCapability, hasLoaderApi, hasPluginHostApi } from "./utils/capability";
export type { CapabilityName } from "./utils/capability";

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
