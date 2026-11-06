/**
 * @comvi/solid — the Solid binding of the 0.8 core (design §3.4): `<I18nProvider>`, `useI18n()`,
 * `<T>`, and `handover()` for a server render. `createI18n` is re-exported, so a Solid app
 * imports one package; `@comvi/solid/format` adds `useFormat()`.
 */
export { createI18n } from "@comvi/core";
export { handover } from "@comvi/core/internal";
export { I18nProvider, useI18n } from "./binding";
export { T } from "./T";
export type { Handover } from "@comvi/core/internal";
export type {
  BoundT,
  I18nProviderProps,
  TagComponent,
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
  // A generated comvi.d.ts that augments @comvi/solid imports Tag from it (typegen v2).
  Catalogs,
  Tag,
} from "@comvi/core";
