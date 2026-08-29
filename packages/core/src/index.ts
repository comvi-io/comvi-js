// @comvi/core — the BASE host: text + `{param}` interpolation, the translation
// cache, events, default params and the `.with(installer)` composition pipe.
// A capability is absent because its module never entered your bundle, never
// because a runtime flag turned it off. Each one is a subpath import:
//   • `@comvi/core/icu`      — `icuCompiler` for plural/select/selectordinal
//     (`compiler: icuCompiler` for inline catalogs, `.with(icu())` BEFORE any
//     catalog for remote ones);
//   • `@comvi/core/loader`   — registerLoader / reloadTranslations,
//     `createImportMapLoader`, automatic nested-catalog flattening;
//   • `@comvi/core/plugins`  — use / locale detector / missing-key callbacks /
//     post-processors / plugin data;
//   • `@comvi/core/devtools` — `instanceId` and the `window.__COMVI__` handshake;
//   • `@comvi/core/rich-text` — the PURE `<T>` toolbox, no registration side
//     effect (the tag grammar travels per call); framework `<T>` imports this;
//   • `@comvi/core/tags`     — the same toolbox PLUS ambient registration, which
//     makes `<tag>…</tag>` syntax for plain string-API `t()`.
//
// ICU syntax under the default compiler is never rendered plausibly-wrong: dev
// throws `E_ICU_SYNTAX` at ingestion, production renders the braced segment
// literally and reports through `onError`. Without a tags extension
// `<tag>…</tag>` is not syntax and stays literal text (dev-warned).
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

export { createBoundTranslation } from "./utils/createBoundTranslation";
export { translationResultToString } from "./utils/translationResultToString";
export { subscribeToRevision, REVISION_EVENTS } from "./utils/subscribeToRevision";
export type { RevisionEvent, RevisionEventSource } from "./utils/subscribeToRevision";
export { missingCapability, hasLoaderApi, hasPluginHostApi } from "./utils/capability";
export type { CapabilityName } from "./utils/capability";

export {
  formatNumber,
  formatDate,
  formatCurrency,
  formatRelativeTime,
  getTextDirection,
} from "./format";
export type { LocaleSource } from "./format";

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

export { createElement, isVirtualNode } from "./virtualNode";

// Plugin authoring is types-only from the root: the host itself is a capability.
export type { I18nPlugin, I18nPluginFactory, PluginOptions } from "./plugins/types";
