// @comvi/core — THE entry. One entry per package, one mental model.
//
// The root is the BASE host: text + `{param}` interpolation, the translation
// cache, events, default params and the `.with(installer)` composition pipe.
// Nothing else is in the module graph, and nothing is behind a runtime flag —
// a capability is absent because its module never entered your bundle.
//
// Capability = an import you add, never an entry you switch:
//   • `@comvi/core/icu`      — `icuCompiler` for ICU plural/select/selectordinal
//     (`createI18n({ translation, compiler: icuCompiler })` for inline
//     catalogs; `.with(icu())` BEFORE any catalog for remote ones);
//   • `@comvi/core/loader`   — `loader()` / `attachLoader`: registerLoader /
//     getLoader / reloadTranslations, `createImportMapLoader`, and automatic
//     nested-catalog flattening;
//   • `@comvi/core/plugins`  — `plugins()` / `attachPlugins`: use / locale
//     detector / missing-key callbacks / post-processors / plugin data;
//   • `@comvi/core/devtools` — `devtools()` / `attachDevtools`: `instanceId`
//     and the `window.__COMVI__` extension handshake;
//   • `@comvi/core/rich-text` — the PURE `<T>` toolbox: `prepareTranslation`
//     and the VirtualNode helpers, with NO registration side effect (the tag
//     grammar travels per call). This is what framework `<T>` components
//     import;
//   • `@comvi/core/tags`     — the same toolbox PLUS ambient registration:
//     importing it makes `<tag>…</tag>` syntax for plain string-API `t()`.
//
// ICU syntax under the default compiler FAILS LOUD in development and in
// production: `{count, plural, …}` throws `E_ICU_SYNTAX` rather than rendering
// plausibly-wrong text. Without a tags extension `<tag>…</tag>` is not syntax
// and stays literal text (dev-warned). Rich non-primitive param values behave
// the same on every graph: `t` coerces them into the string, `tRaw` preserves
// them as a parts array.
import type { DefaultTranslationParams, I18nOptions } from "./types";
import { I18n as I18nImpl } from "./core/i18n";

/**
 * The published host. The runtime binding IS the base class; the annotation
 * narrows the construct signature to the published one-argument contract, so
 * the internal compiler parameter never reaches the emitted declaration.
 */
export const I18n: new <const D extends DefaultTranslationParams = {}>(
  options: I18nOptions<D>,
) => I18nImpl<D> = I18nImpl;
export type I18n<D extends DefaultTranslationParams = {}> = I18nImpl<D>;

/** The base-host factory: `createI18n(options)` is `new I18n(options)`. */
export function createI18n<const D extends DefaultTranslationParams = {}>(
  options: I18nOptions<D>,
): I18nImpl<D> {
  return new I18nImpl<D>(options);
}

export { TranslationCache } from "./core/TranslationCache";

/**
 * Flatten a nested catalog into the flat `{ "a.b": "…" }` shape the base
 * host stores. PURE — the same function `@comvi/core/loader` exports, and the
 * escape hatch for handing nested data straight to `addTranslations` on a host
 * without the loader capability (which flattens automatically).
 */
export { normalizeTranslationObject as flattenCatalog } from "./utils";

// Utility exports
export { createBoundTranslation } from "./utils/createBoundTranslation";
export { translationResultToString } from "./utils/translationResultToString";
export { subscribeToRevision, REVISION_EVENTS } from "./utils/subscribeToRevision";
export type { RevisionEvent, RevisionEventSource } from "./utils/subscribeToRevision";
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
export type * from "./types";
export type { MessageCompiler, SyntaxExtension } from "./core/translate/syntax";
export type { IcuSyntaxError } from "./core/translate/compile-simple";
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
