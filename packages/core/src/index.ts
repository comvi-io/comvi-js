/**
 * @comvi/core — the 0.8 core: `createI18n`, the typed `t()`, `negotiate`.
 *
 * Subpaths: `/cdn` (the CDN v1 loader), `/plugins` (locale detection and persistence),
 * `/format` (Intl formatters over the shared cache), `/devtools` (the browser-extension
 * hook), `/internal` (binding seams, no semver guarantee).
 */
export { createI18n } from "./instance";
export { negotiate } from "./locale";
export type { I18n, I18nOptions, Loader, Plugin } from "./instance";
export type { I18nError, I18nErrorCode, OnError } from "./errors";
export type { Catalog } from "./compile/cache";
export type {
  Args,
  Catalogs,
  KeysOf,
  NsOf,
  OutOf,
  ParamsFor,
  RichParts,
  Tag,
  TagChildren,
  TFor,
  TranslateFn,
  UntypedT,
} from "./types";
