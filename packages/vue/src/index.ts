/**
 * @comvi/vue — the Vue binding of the 0.8 core (design §3.5): `createI18n()` (a Vue plugin:
 * `app.use(i18n)`), `useI18n()`, `<T>`, the global `$t`, and `handover()` for a server
 * render. `@comvi/vue/format` adds `useFormat()`.
 */
import type { UseI18n } from "./binding";

export { createI18n, useI18n } from "./binding";
export { T } from "./T";
export { handover } from "@comvi/core/internal";
export type { Handover } from "@comvi/core/internal";
export type {
  BoundT,
  Children,
  TagComponent,
  TagSlotProps,
  TComponent,
  UntypedParams,
  UseI18n,
  VueI18n,
} from "./binding";
export type {
  Catalog,
  I18n,
  I18nError,
  I18nErrorCode,
  I18nOptions,
  Loader,
  Plugin,
  // A generated comvi.d.ts that augments @comvi/vue imports Tag from it (typegen v2).
  Catalogs,
  Tag,
} from "@comvi/core";

declare module "vue" {
  interface ComponentCustomProperties {
    /** `t()` of the app's instance in the default namespace, in every template. */
    $t: UseI18n["t"];
  }
}
