// @comvi/core — the BASE instance: text + `{param}` interpolation, the translation
// cache, events, default params and the `.use(installer)` composition pipe.
// A capability is absent because its module never entered your bundle, never
// because a runtime flag turned it off. Each one is a subpath import:
//   • `@comvi/core/icu`      — `icuCompiler` for plural/select/selectordinal
//     (pass it as `compiler: icuCompiler` in the constructor options);
//   • `@comvi/core/loader`   — registerLoader / reloadMessages,
//     `createImportMapLoader`;
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
 * The published instance. The runtime binding IS the base class; the annotation
 * narrows the construct signature to the published one-argument contract, so
 * the internal compiler parameter never reaches the emitted declaration.
 */
export const I18n: new <const D extends DefaultTranslationParams = {}>(
  options: I18nOptions<D>,
) => I18nImpl<D> = I18nImpl;
export type I18n<D extends DefaultTranslationParams = {}> = I18nImpl<D>;

/** The base-instance factory: `createI18n(options)` is `new I18n(options)`. */
export function createI18n<const D extends DefaultTranslationParams = {}>(
  options: I18nOptions<D>,
): I18nImpl<D> {
  return new I18nImpl<D>(options);
}

export { MessagesCache } from "./core/MessagesCache";

/**
 * Flatten a nested catalog into the flat `{ "a.b": "…" }` shape an instance stores.
 * PURE, and NOT required: `options.messages` and `addMessages()` accept
 * nested objects on every instance and flatten them themselves. Reach for this only
 * to pre-flatten data by hand — to inspect the keys a catalog will produce, or
 * to merge several sources before handing one object over.
 *
 * Non-string leaves are coerced with `String()` and `null`/`undefined` leaves
 * are dropped (with a dev warning). Input that already has the stored shape —
 * every own value a string, on a null prototype or a plain `Object.prototype`
 * object — is returned BY REFERENCE, without a copy. Any other input, including
 * a null-prototype object with nested values, is flattened into a new
 * null-prototype object; the caller's object is never mutated.
 *
 * Outside the supported catalog shape: non-enumerable own properties, accessor
 * properties, Proxies and symbol keys (a lookup may see what SSR serialization
 * omits). Enumerable keys added to `Object.prototype` after ingestion are not
 * guarded against.
 */
export { normalizeTranslationObject as flattenCatalog } from "./utils";

export { createBoundTranslation } from "./utils/createBoundTranslation";
export { translationResultToString } from "./utils/translationResultToString";
export { subscribeToRevision, REVISION_EVENTS } from "./utils/subscribeToRevision";
export type { RevisionEvent, RevisionEventSource } from "./utils/subscribeToRevision";
export { missingCapability, hasLoaderApi, hasPluginApi } from "./utils/capability";
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

// Plugin authoring is types-only from the root: the instance itself is a capability.
export type { I18nPlugin, I18nPluginFactory, PluginOptions } from "./plugins/types";
