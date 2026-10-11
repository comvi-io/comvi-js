import { useRouter } from "#app";
import type { RouteLocationRaw, RouteLocationResolved } from "vue-router";
import { useLocalePath } from "./useLocalePath";
import { isExternalTarget } from "../utils/locale-path";

/**
 * Like useLocalePath, but returns a full resolved route object instead of just
 * the path.
 *
 * @example
 * ```vue
 * <script setup>
 * const localeRoute = useLocaleRoute()
 *
 * const aboutRoute = localeRoute('/about')
 * console.log(aboutRoute.path) // '/de/about' (if current locale is 'de')
 * </script>
 * ```
 */
export function useLocaleRoute() {
  const router = useRouter();
  const localePath = useLocalePath();

  /**
   * Get resolved route object with locale prefix
   *
   * @param route - Route location (path string or route object)
   * @param locale - Target locale (defaults to current locale)
   * @returns Resolved route object with locale-prefixed path, or `undefined`
   *   when the target is not a route of this app — an off-site URL included.
   */
  function localeRoute(
    route: RouteLocationRaw,
    locale?: string,
  ): RouteLocationResolved | undefined {
    const path = localePath(route, locale);

    // An external URL or a protocol-relative host is not a route here, which is
    // what this composable's `undefined` already means for a path the router
    // does not know. Handing it to `router.resolve` produced a record with
    // `matched: []` whose path was the URL glued onto the current route
    // (`/en/https://example.com/a`), plus a vue-router "No match found"
    // warning — a value a caller could still bind to a link. For the href
    // itself, `useLocalePath` returns the URL untouched.
    if (isExternalTarget(path)) {
      return undefined;
    }

    try {
      return router.resolve(path);
    } catch {
      // Route might not exist in the router
      return undefined;
    }
  }

  return localeRoute;
}
