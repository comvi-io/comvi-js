import type { NextRequest } from "next/server";
import type { RoutingConfig } from "../routing/types";

/**
 * A detection source. The URL path is always consulted first and is not one of
 * these. `query` reads `queryParam`, `header` reads `headerName`; each is inert
 * until its name is set.
 */
export type LocaleDetectionSource = "query" | "cookie" | "header" | "accept-language";

/**
 * Function type for custom Accept-Language resolution.
 *
 * @example Using @formatjs/intl-localematcher (recommended for production)
 * ```typescript
 * import Negotiator from 'negotiator';
 * import { match } from '@formatjs/intl-localematcher';
 *
 * const resolveAcceptLanguage = (header, locales, defaultLocale) => {
 *   try {
 *     const languages = new Negotiator({
 *       headers: { 'accept-language': header }
 *     }).languages();
 *     return match(languages, [...locales], defaultLocale);
 *   } catch {
 *     return undefined;
 *   }
 * };
 * ```
 */
export type ResolveAcceptLanguage = (
  acceptLanguage: string,
  locales: readonly string[],
  defaultLocale: string,
) => string | undefined;

/**
 * The locale cookie's attributes. The same object, with the same defaults
 * except the name, is `@comvi/nuxt`'s `localeCookie`.
 */
export interface LocaleCookieOptions {
  /** @default 'NEXT_LOCALE' */
  name?: string;
  /**
   * Lifetime in seconds.
   * @default 31536000 (one year)
   */
  maxAge?: number;
  /**
   * Set the Secure flag, so the cookie is only sent over HTTPS. Always off in
   * development (`NODE_ENV=development`), so localhost over HTTP keeps it.
   * @default true
   */
  secure?: boolean;
  /** @default 'lax' */
  sameSite?: "lax" | "strict" | "none";
  /** Send the cookie to this domain and its subdomains. Unset: the host only. */
  domain?: string;
}

/**
 * Where the locale preference is persisted: `false` writes and reads no cookie,
 * a string is the cookie name, an object sets its attributes.
 */
export type LocaleCookieConfig = false | string | LocaleCookieOptions;

export interface LocaleDetectionConfig {
  /**
   * Detection order. The URL path is always checked first; `query` and
   * `header` do nothing until `queryParam` and `headerName` are set.
   * @default ['query', 'cookie', 'accept-language']
   */
  order?: LocaleDetectionSource[];

  /**
   * Query parameter to read an explicit locale from (`"lang"` reads `?lang=de`).
   * Values outside `locales` are ignored.
   * @default undefined (not checked)
   */
  queryParam?: string;

  /**
   * Custom header name to read locale from
   * Useful when you have a proxy that sets locale header
   * @default undefined (not checked unless in order)
   */
  headerName?: string;

  /**
   * The built-in default is a simple parser that handles common cases. For
   * production apps with diverse locales (especially CJK), consider
   * @formatjs/intl-localematcher for RFC-compliant matching.
   *
   * @default Built-in simple parser
   */
  resolveAcceptLanguage?: ResolveAcceptLanguage;
}

export interface MiddlewareConfig extends RoutingConfig {
  /**
   * Custom locale detection logic (optional)
   * If provided, this function is called first to detect locale
   * Return undefined to fall back to default detection
   */
  detectLocale?: (request: NextRequest) => string | undefined;

  /**
   * Where the locale comes from after the URL path. `false` turns detection
   * off: the path decides, otherwise `defaultLocale`.
   */
  localeDetection?: false | LocaleDetectionConfig;
}
