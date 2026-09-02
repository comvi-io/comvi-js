import { defineRouting } from "./routing/defineRouting";
import type { LocalePrefixMode, RoutingConfig } from "./routing/types";

/**
 * The routing half of both Next.js factories' options.
 *
 * Core-free by construction: nothing here imports `@comvi/core`, which is why
 * `createNextI18nFromHost` can share it without adding a core module the
 * caller's own composed host did not already bring.
 */
export interface NextRoutingOptions {
  /**
   * List of supported locales
   *
   * `readonly` to match `RoutingConfig.locales`, `hasLocale` and the
   * middleware helpers: nothing here mutates the list, and demanding a mutable
   * one made `createNextI18n({ ...defineRouting(...) })` — this package's own
   * routing object spread into its own factory — a type error, along with the
   * `as const` tuple `hasLocale` narrowing asks callers for.
   * @example ['en', 'de', 'uk', 'fr']
   */
  locales: readonly string[];

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
 * The explicit pick is the point: `createNextI18n`'s options also carry i18n
 * fields, and `defineRouting` spreads whatever it is handed.
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
