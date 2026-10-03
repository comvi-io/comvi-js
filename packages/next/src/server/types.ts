import type { AcceptedKey, ArgsFor, NamespacedKeys, Namespaces } from "@comvi/core";

export interface GetI18nOptions {
  /** Explicit locale (for generateMetadata, etc.) - defaults to request locale */
  locale?: string;
  /** Default namespace to use (overrides i18n.defaultNs) */
  ns?: string;
}

/**
 * The Server Component translation function: returns a plain string, never a
 * `TranslationResult`.
 *
 * ONE signature, keyed through core's `AcceptedKey` / `ArgsFor` pair exactly as
 * every client binding is — see `AcceptedKey` for why the key union is spelled
 * out inline rather than named.
 */
export interface TranslationFunction {
  <
    K extends { [P in AcceptedKey]: P }[AcceptedKey] | NamespacedKeys<N>,
    N extends Namespaces = never,
  >(
    key: K,
    ...params: ArgsFor<K, undefined, {}, N>
  ): string;
}

export interface HasTranslationOptions {
  /** Namespace to check (defaults to defaultNamespace) */
  ns?: string;
  /** Locale to check (defaults to current locale) */
  locale?: string;
}

export interface ServerI18n {
  t: TranslationFunction;
  hasTranslation: (key: string, options?: HasTranslationOptions) => boolean;
  /**
   * The locale this call resolved — the explicit `locale` option when given,
   * otherwise the request locale — and the exact string `t` closes over. Read
   * it instead of calling `getLocale()` a second time, which can only differ.
   *
   * The same member `@comvi/nuxt`'s `useTranslation` returns: both server
   * helpers are `{ t, hasTranslation, locale }`. See
   * `docs/design/next-nuxt-parity.md`.
   */
  locale: string;
}

export interface RequestStore {
  locale: string | undefined;
  /**
   * `locale:namespace` pairs whose load failed during this request. They are
   * not retried before the request ends: the render already went without
   * them, and a later success would hand the client a catalog the server
   * render never used.
   */
  failedLoads?: Set<string>;
}

/**
 * The per-request half of a `getI18n()` call — everything a lookup needs that
 * the process-wide host must not supply.
 *
 * `getI18n` resolves both fields once and closes over them; `t` and
 * `hasTranslation` read nothing else request-shaped. Naming the shape keeps the
 * split visible: the shared host contributes catalog and loader only.
 *
 * @internal
 */
export interface RequestView {
  /** The locale resolved for THIS request, passed explicitly into every lookup. */
  locale: string;
  /** The namespace bound into `t()` when the caller names none. */
  defaultNs: string;
}
