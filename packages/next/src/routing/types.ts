/**
 * Locale prefix mode for URL routing
 */
export type LocalePrefixMode = "always" | "as-needed" | "never";

/**
 * Configuration for i18n routing
 *
 * @typeParam T - Union type of supported locale strings (e.g., 'en' | 'uk' | 'de')
 */
export interface RoutingConfig<T extends string = string> {
  /** Supported locales */
  locales: readonly T[];
  /** Default locale */
  defaultLocale: T;
  /**
   * Locale prefix mode:
   * - 'always': All routes have locale prefix (/en/about, /de/about)
   * - 'as-needed': Only non-default locales have prefix (/about for en, /de/about for de)
   * - 'never': No locale prefixes (use cookie/header only)
   * @default 'as-needed'
   */
  localePrefix?: LocalePrefixMode;
  /**
   * Cookie name for storing locale preference
   * @default 'NEXT_LOCALE'
   */
  localeCookie?: string;
  /**
   * Path configurations for different locales (optional)
   * Allows different URL paths per locale
   * @example { '/about': { en: '/about', de: '/ueber-uns' } }
   */
  pathnames?: Record<string, Partial<Record<T, string>>>;
}
