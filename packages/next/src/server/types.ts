import type {
  TranslationParams,
  NamespacedKeys,
  Namespaces,
  NamespacedParamsArg,
  ParamsArg,
  PermissiveKey,
} from "@comvi/core";

export interface GetI18nOptions {
  /** Explicit locale (for generateMetadata, etc.) - defaults to request locale */
  locale?: string;
  /** Default namespace to use (overrides i18n.defaultNs) */
  ns?: string;
}

/**
 * The Server Component translation function: returns a plain string, never a
 * `TranslationResult`.
 */
export interface TranslationFunction {
  <NS extends Namespaces, K extends NamespacedKeys<NS>>(
    key: K,
    ...params: NamespacedParamsArg<NS, K>
  ): string;
  <K extends import("@comvi/core").DefaultNsKeys>(key: K, ...params: ParamsArg<K>): string;
  (key: PermissiveKey, params?: TranslationParams): string;
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
}

export interface RequestStore {
  locale: string | undefined;
}
