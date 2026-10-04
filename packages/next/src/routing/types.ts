import type { LocaleCookieConfig } from "../middleware/types";

export type LocalePrefixMode = "always" | "as-needed" | "never";

/**
 * @typeParam T - Union type of supported locale strings (e.g., 'en' | 'uk' | 'de')
 */
export interface RoutingConfig<T extends string = string> {
  locales: readonly T[];
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
   * The locale cookie: a name, its attributes, or `false` to persist nothing.
   * @default 'NEXT_LOCALE'
   */
  localeCookie?: LocaleCookieConfig;
  /**
   * A different URL path per locale.
   * @example { '/about': { en: '/about', de: '/ueber-uns' } }
   */
  pathnames?: Record<string, Partial<Record<T, string>>>;
}
