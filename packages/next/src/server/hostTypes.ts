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
 *
 * The host lives at module scope and is shared by every concurrent request the
 * App Router process handles, so its contribution to a request is the CATALOG
 * and the LOADER; the locale belongs to the request. `t`/`tRaw` are therefore
 * absent on purpose: a server helper that translated through the host would
 * resolve against the host's process-wide locale and leak one request's locale
 * into another request's tree, and this type makes that a compile error rather
 * than a review note.
 *
 * @internal
 */
export type ServerI18nHost = Pick<
  WrapperI18nHost,
  | "isInitialized"
  | "init"
  | "getDefaultNamespace"
  | "hasLocale"
  | "hasTranslation"
  | "getTranslations"
  | "getFallbackLocales"
> &
  Pick<I18nLoaderApi, "getLoader" | "reloadTranslations">;

/**
 * The single sanctioned crossing back to the host's translator.
 *
 * `getI18n` binds it once per request and passes an explicit `locale` in the
 * params of every call, so the lookup never falls back to the host's locale.
 * Nothing else under `src/server/` may name this type.
 *
 * @internal
 */
export type ServerTranslatingHost = ServerI18nHost & Pick<WrapperI18nHost, "t" | "tRaw">;
