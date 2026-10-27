/**
 * @comvi/react — the React binding of the 0.8 core (design §3.4): `<I18nProvider>`,
 * `useI18n()`, `useLocale()`, `<T>`. `createI18n` is re-exported, so a React app imports
 * one package; `@comvi/react/format` adds `useFormat()`.
 */
export { createI18n } from "@comvi/core";
export { I18nHandover, I18nProvider, T, useI18n, useLocale } from "./binding";
export type {
  I18nHandoverProps,
  I18nProviderProps,
  ProviderCatalogs,
  TComponent,
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
} from "@comvi/core";
