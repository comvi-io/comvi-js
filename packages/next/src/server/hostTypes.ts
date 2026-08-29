// `ServerI18nHost` is a `Pick`, not an alias of `NextServerHost`, so that BOTH
// `@comvi/next`'s own composed host (`NextComposedI18n`, any `D`) and every
// `NextServerHost<D>` satisfy it structurally. It is never re-exported from
// `@comvi/next/server`.
import type { DefaultTranslationParams, I18nLoaderApi, WrapperI18nHost } from "@comvi/core";

/**
 * The instance contract a Next.js server host must satisfy: the base host
 * surface (`@comvi/core`) plus the loader capability, which comes from
 * `@comvi/core/loader` and nowhere else — the base root composes nothing, so
 * a plain `createI18n(...)` does NOT satisfy this type.
 *
 * @example
 * ```typescript
 * import { createI18n } from "@comvi/core";
 * import { attachLoader } from "@comvi/core/loader";
 *
 * const host = () => attachLoader(createI18n({ locale: "en" }));
 * ```
 */
export type NextServerHost<D extends DefaultTranslationParams = {}> = WrapperI18nHost<D> &
  I18nLoaderApi;

/**
 * The members the server pipeline reads off its host — nothing else.
 * @internal
 */
export type ServerI18nHost = Pick<
  WrapperI18nHost,
  | "t"
  | "tRaw"
  | "isInitialized"
  | "init"
  | "getDefaultNamespace"
  | "hasLocale"
  | "hasTranslation"
  | "getTranslations"
> &
  Pick<I18nLoaderApi, "getLoader" | "reloadTranslations">;
