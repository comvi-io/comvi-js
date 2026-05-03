import type { NextRequest } from "next/server";
import type { RoutingConfig } from "../routing/types";

/**
 * Locale detection source types
 */
export type LocaleDetectionSource = "cookie" | "header" | "accept-language";

/**
 * Function type for custom Accept-Language resolution
 *
 * @param acceptLanguage - The Accept-Language header value
 * @param locales - Array of supported locales
 * @param defaultLocale - The default locale to fall back to
 * @returns The matched locale or undefined
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
 * Configuration for locale detection
 */
export interface LocaleDetectionConfig {
  /**
   * Detection order (URL path is always checked first)
   * @default ['cookie', 'accept-language']
   */
  order?: LocaleDetectionSource[];

  /**
   * Cookie name for storing locale preference
   * @default 'NEXT_LOCALE'
   */
  cookieName?: string;

  /**
   * Set the Secure flag on the locale cookie.
   * When true, the cookie is only sent over HTTPS.
   * Automatically disabled in development (NODE_ENV=development) regardless of this setting.
   * @default true
   */
  cookieSecure?: boolean;

  /**
   * Custom header name to read locale from
   * Useful when you have a proxy that sets locale header
   * @default undefined (not checked unless in order)
   */
  headerName?: string;

  /**
   * Custom Accept-Language resolution function (pluggable)
   *
   * By default, uses a simple parser that handles common cases.
   * For production apps with diverse locales (especially CJK languages),
   * consider using @formatjs/intl-localematcher for RFC-compliant matching.
   *
   * @default Built-in simple parser
   */
  resolveAcceptLanguage?: ResolveAcceptLanguage;
}

/**
 * Configuration for i18n middleware
 */
export interface MiddlewareConfig extends RoutingConfig {
  /**
   * Custom locale detection logic (optional)
   * If provided, this function is called first to detect locale
   * Return undefined to fall back to default detection
   */
  detectLocale?: (request: NextRequest) => string | undefined;

  /**
   * Locale detection configuration
   * Allows customizing detection sources and their order
   */
  localeDetection?: LocaleDetectionConfig;
}
