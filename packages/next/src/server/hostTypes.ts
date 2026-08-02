// Host contracts for the Next.js server pipeline (framework-slim plan P5).
//
// Two types, deliberately separate:
//
//   `NextServerHost<D>` is the PUBLIC contract of `createNextI18nFromHost` —
//   the wrapper host surface plus the loader capability, because a server
//   ALWAYS needs `loadTranslations`. ICU and tag interpolation enter the graph
//   only when the app composes them into its own host factory.
//
//   `ServerI18nHost` is INTERNAL: the narrow structural surface the server
//   pipeline (cache / ensureInitialized / loadTranslations / getI18n) actually
//   touches. It is a `Pick`, not an alias of `NextServerHost`, so that BOTH a
//   root `I18n` (any `D`) and every `NextServerHost<D>` satisfy it
//   structurally. It is never re-exported from `@comvi/next/server`.
import type { DefaultTranslationParams, I18nLoaderApi, WrapperI18nHost } from "@comvi/core";

/**
 * The instance contract a Next.js server host must satisfy: the framework
 * wrapper surface (`@comvi/core/slim`) plus the loader capability
 * (`@comvi/core/loader`, or the root entry, which composes both).
 *
 * @example
 * ```typescript
 * import { createI18n } from "@comvi/core/slim";
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
