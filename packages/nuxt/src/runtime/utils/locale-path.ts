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
  serializeLocaleCookie,
  setQueryParamInSuffix,
  splitPathAndSuffix,
  stripLocalePrefix,
} from "../_vendor/locale-routing";

/**
 * A target that is NOT an app-internal path: an absolute URL carrying a scheme
 * (`https:`, `mailto:`, `tel:`, any RFC 3986 scheme) or a protocol-relative
 * `//host/path`. The pattern is anchored at the first character, so a colon
 * inside a path segment (`/notes:2024`) stays an ordinary path.
 *
 * Same rule as `@comvi/next`'s `isExternalHref`, written here rather than
 * shared: `runtime/` ships file by file with no bundling step, so it may only
 * import from `_vendor/`, and the vendored copy is pinned byte-for-byte to the
 * workspace locale-routing package.
 */
export function isExternalTarget(target: string): boolean {
  return /^[a-z][a-z0-9+.-]*:/i.test(target) || target.startsWith("//");
}

/**
 * `?tab=billing` / `#details`: a target with no path at all. It resolves
 * against the CURRENT document URL, which is already localized — prefixing it
 * would send the link to the locale root and drop the page the user is on.
 */
export function isQueryOrFragmentOnly(target: string): boolean {
  return target.startsWith("?") || target.startsWith("#");
}

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
