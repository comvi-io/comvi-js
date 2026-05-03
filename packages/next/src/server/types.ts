import type {
  TranslationParams,
  NamespacedKeys,
  Namespaces,
  NamespacedParamsArg,
  ParamsArg,
  PermissiveKey,
} from "@comvi/core";

/**
 * Options for getI18n function
 */
export interface GetI18nOptions {
  /** Explicit locale (for generateMetadata, etc.) - defaults to request locale */
  locale?: string;
  /** Default namespace to use (overrides i18n.defaultNs) */
  ns?: string;
}

/**
 * Translation function type for Server Components (returns string)
 */
export interface TranslationFunction {
  <NS extends Namespaces, K extends NamespacedKeys<NS>>(
    key: K,
    ...params: NamespacedParamsArg<NS, K>
  ): string;
  <K extends import("@comvi/core").DefaultNsKeys>(key: K, ...params: ParamsArg<K>): string;
  (key: PermissiveKey, params?: TranslationParams): string;
}

/**
 * Options for hasTranslation check
 */
export interface HasTranslationOptions {
  /** Namespace to check (defaults to defaultNamespace) */
  ns?: string;
  /** Locale to check (defaults to current locale) */
  locale?: string;
}

/**
 * Result returned by getI18n
 */
export interface ServerI18n {
  /** Translation function */
  t: TranslationFunction;
  /** Check if a translation key exists */
  hasTranslation: (key: string, options?: HasTranslationOptions) => boolean;
}

/**
 * Internal request store interface
 */
export interface RequestStore {
  locale: string | undefined;
}
