/**
 * Thin adapter over the shared locale-routing primitives: re-exports the shared
 * implementations and keeps the nuxt-side POSITIONAL `buildLocalizedPath`
 * signature the runtime composables and the global middleware call.
 *
 * The import is `../_vendor/locale-routing`, a COMMITTED copy of
 * `packages/locale-routing/src/index.ts` (`pnpm --filter @comvi/nuxt vendor`,
 * pinned by `tests/vendor-parity.test.ts`). `nuxt-module-build` transpiles
 * `runtime/` file by file and leaves bare specifiers alone, so a workspace
 * package imported here would ship as an unresolvable import; there is no
 * bundling step to inline it with.
 */
import { buildLocalizedPath as buildLocalizedPathShared } from "../_vendor/locale-routing";

export {
  extractLocaleFromPath,
  setQueryParamInSuffix,
  splitPathAndSuffix,
  stripLocalePrefix,
} from "../_vendor/locale-routing";

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
