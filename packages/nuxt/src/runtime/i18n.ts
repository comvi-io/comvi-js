/**
 * `@comvi/nuxt/i18n` — what a `comvi.i18n.ts` options file (and a plain module that
 * formats outside a component) names. `@comvi/core` is a dependency of THIS package, not
 * of the app: one install of `@comvi/nuxt` is enough to follow the recipe.
 *
 * Named re-exports only, one hop from a pure `@comvi/core` subpath; no `export *`, and no
 * `createI18n`: the module creates the instance.
 */
import type { I18nOptionsFactory } from "../types";

export { cdn, api, createCatalogStore } from "@comvi/core/cdn";
export { devtools } from "@comvi/core/devtools";
export {
  formatNumber,
  formatCurrency,
  formatDate,
  formatDateRange,
  formatRelativeTime,
  formatList,
  displayName,
} from "@comvi/core/format";
export type { Loader, Plugin, I18nError, OnError } from "@comvi/core";
export type { I18nOptionsFactory, NuxtI18nFileOptions } from "../types";

/**
 * Types the default export of `comvi.i18n.ts`: the factory comes back unchanged. The
 * module calls it once per instance — with the request's H3 event on a server (the page
 * render, `useTranslation(event)`), with `undefined` in the browser — and creates the
 * instance from `nuxt.config`'s `comvi` data and what it returns.
 *
 * @example
 * ```ts
 * export default defineI18nOptions(() => ({
 *   loader: async (locale, ns) => (await import(`./locales/${ns}/${locale}.json`)).default,
 * }));
 * ```
 */
export const defineI18nOptions = (factory: I18nOptionsFactory): I18nOptionsFactory => factory;
