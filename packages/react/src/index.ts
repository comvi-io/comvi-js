/**
 * @comvi/react — the React binding of the 0.8 core (design §3.4): `<I18nProvider>`,
 * `useI18n()`, `useLocale()`, `<T>`. `createI18n` is re-exported, so a React app imports
 * one package; `@comvi/react/format` adds `useFormat()`.
 */
export { createI18n } from "@comvi/core";
export { I18nProvider, T, useI18n, useLocale } from "./binding";
export { I18nHandover } from "./handover";
export type { I18nHandoverProps } from "./handover";
export type {
  BoundT,
  I18nProviderProps,
  ProviderCatalogs,
  TComponent,
  UntypedParams,
  UseI18n,
} from "./binding";
export type {
  Catalog,
  I18n,
  I18nError,
  I18nErrorCode,
  I18nOptions,
  Loader,
  Plugin,
  // A generated comvi.d.ts that augments @comvi/react imports Tag from it (typegen v2).
  Catalogs,
  Tag,
} from "@comvi/core";
