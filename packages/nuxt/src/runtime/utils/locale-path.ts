/**
 * Locale path utilities — thin adapter over @comvi/locale-routing.
 *
 * The implementations live in the shared framework-neutral package (also
 * consumed by @comvi/next); this module re-exports them and keeps the
 * nuxt-side positional `buildLocalizedPath` signature used by the runtime
 * composables and the global middleware.
 */
import { buildLocalizedPath as buildLocalizedPathShared } from "@comvi/locale-routing";

export {
  extractLocaleFromPath,
  setQueryParamInSuffix,
  splitPathAndSuffix,
  stripLocalePrefix,
} from "@comvi/locale-routing";

/**
 * Build a localized path based on prefix mode.
 *
 * Preserves trailing slashes: if the input ends with "/" the output will too.
 *
 * @param path - Clean path (without locale prefix)
 * @param locale - Target locale
 * @param defaultLocale - Default locale code
 * @param localePrefix - Prefix mode ('always' | 'as-needed' | 'never')
 * @returns Localized path
 */
export function buildLocalizedPath(
  path: string,
  locale: string,
  defaultLocale: string,
  localePrefix: "always" | "as-needed" | "never",
): string {
  return buildLocalizedPathShared(path, locale, { defaultLocale, localePrefix });
}
