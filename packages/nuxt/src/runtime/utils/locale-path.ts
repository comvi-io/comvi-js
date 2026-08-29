/**
 * Thin adapter over @comvi/locale-routing: re-exports the shared
 * implementations and keeps the nuxt-side POSITIONAL `buildLocalizedPath`
 * signature the runtime composables and the global middleware call.
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
 */
export function buildLocalizedPath(
  path: string,
  locale: string,
  defaultLocale: string,
  localePrefix: "always" | "as-needed" | "never",
): string {
  return buildLocalizedPathShared(path, locale, { defaultLocale, localePrefix });
}
