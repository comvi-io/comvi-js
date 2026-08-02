import { defineRouting } from "./routing/defineRouting";
import type { LocalePrefixMode, RoutingConfig } from "./routing/types";

/**
 * The routing half of both Next.js factories' options — the only fields
 * `createNextI18nFromHost` accepts, and the first block of
 * `createNextI18n`'s options.
 *
 * Root-free by construction: nothing here reaches `@comvi/core`, which is why
 * `createNextI18nFromHost` can share it without pulling the root entry into a
 * slim server graph.
 */
export interface NextRoutingOptions {
  /**
   * List of supported locales
   * @example ['en', 'de', 'uk', 'fr']
   */
  locales: string[];

  /**
   * Default locale (used when no locale is detected)
   * @example 'en'
   */
  defaultLocale: string;

  /**
   * Locale prefix mode for URLs
   * - 'always': Always include locale in URL (/en/about, /de/about)
   * - 'as-needed': Only include for non-default locales (/about, /de/about)
   * - 'never': Never include locale in URL (use cookies/headers)
   * @default 'as-needed'
   */
  localePrefix?: LocalePrefixMode;

  /**
   * Localized public pathnames for exact static routes.
   * Keys are canonical internal routes, values are public localized slugs.
   */
  pathnames?: RoutingConfig["pathnames"];
}

/**
 * Feed the routing half of a factory's options to `defineRouting` — which
 * applies the `localePrefix` / `localeCookie` / `pathnames` defaults — and
 * produce the `routing` field both factory results expose. The explicit pick
 * is the point: `createNextI18n`'s options also carry i18n fields, and
 * `defineRouting` spreads whatever it is handed.
 *
 * @internal
 */
export const resolveRouting = ({
  locales,
  defaultLocale,
  localePrefix,
  pathnames,
}: NextRoutingOptions): Required<RoutingConfig> =>
  defineRouting({ locales, defaultLocale, localePrefix, pathnames });
