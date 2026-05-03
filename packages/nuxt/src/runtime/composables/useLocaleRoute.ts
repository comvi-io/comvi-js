import { useRouter } from "#app";
import type { RouteLocationRaw, RouteLocationResolved } from "vue-router";
import { useLocalePath } from "./useLocalePath";

/**
 * Composable to get locale-prefixed route objects
 *
 * Similar to useLocalePath but returns a full route object instead of just the path
 *
 * @returns Function that returns a resolved route with locale prefix
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
   * @returns Resolved route object with locale-prefixed path
   */
  function localeRoute(
    route: RouteLocationRaw,
    locale?: string,
  ): RouteLocationResolved | undefined {
    const path = localePath(route, locale);

    try {
      return router.resolve(path);
    } catch {
      // Route might not exist in the router
      return undefined;
    }
  }

  return localeRoute;
}
