import { useRuntimeConfig, useRouter } from "#app";
import { useLocaleState } from "../utils/locale-state";
import type { RouteLocationRaw } from "vue-router";
import { stripLocalePrefix, buildLocalizedPath, splitPathAndSuffix } from "../utils/locale-path";

type QueryValue = string | number | boolean | null | undefined;
type QueryRecord = Record<string, QueryValue | QueryValue[]>;

const toQueryString = (query: QueryRecord | undefined): string => {
  if (!query) {
    return "";
  }

  const params = new URLSearchParams();

  for (const [key, value] of Object.entries(query)) {
    if (Array.isArray(value)) {
      for (const item of value) {
        if (item !== null && item !== undefined) {
          params.append(key, String(item));
        }
      }
      continue;
    }

    if (value !== null && value !== undefined) {
      params.append(key, String(value));
    }
  }

  const encoded = params.toString();
  return encoded ? `?${encoded}` : "";
};

/**
 * Composable to get locale-prefixed paths.
 *
 * @example
 * ```vue
 * <script setup>
 * const localePath = useLocalePath()
 * </script>
 *
 * <template>
 *   <NuxtLink :to="localePath('/about')">About</NuxtLink>
 *   <NuxtLink :to="localePath('/contact', 'de')">Kontakt (DE)</NuxtLink>
 * </template>
 * ```
 */
export function useLocalePath() {
  const config = useRuntimeConfig();
  const { locales, defaultLocale, localePrefix } = config.public.comvi;
  const localeState = useLocaleState();
  const router = useRouter();

  /** @param locale - defaults to the current locale. */
  function localePath(path: RouteLocationRaw, locale?: string): string {
    const targetLocale = locale || localeState.value || defaultLocale;

    let resolvedPath = path;

    // Handle named routes by appending the correct locale suffix
    if (typeof path === "object" && path !== null && "name" in path && path.name) {
      const nameStr = String(path.name);
      // The user may have passed the suffix manually.
      const baseName = nameStr.split("___")[0];

      const shouldPrefix =
        localePrefix === "always" ||
        (localePrefix === "as-needed" && targetLocale !== defaultLocale);

      resolvedPath = {
        ...path,
        name: shouldPrefix ? `${baseName}___${targetLocale}` : baseName,
      };
    }

    let fullPath = "/";
    try {
      fullPath =
        typeof resolvedPath === "string"
          ? resolvedPath
          : router.resolve(resolvedPath).fullPath || "/";
    } catch {
      if (typeof path === "object" && "path" in path && path.path) {
        fullPath = path.path;
      } else if (typeof resolvedPath === "object" && "name" in resolvedPath) {
        // Unresolvable named route (a partially mocked router in tests):
        // synthesize a path from the name.
        const nameParams = resolvedPath.name
          ? `/${String(resolvedPath.name).replace(/___.*$/, "")}`
          : "";
        const queryStr = toQueryString(resolvedPath.query as QueryRecord | undefined);
        const hashStr = resolvedPath.hash ? String(resolvedPath.hash) : "";
        fullPath = `${nameParams}${queryStr}${hashStr}`;
      }
    }

    const { pathname, suffix } = splitPathAndSuffix(fullPath);

    const normalizedPath = pathname.startsWith("/") ? pathname : `/${pathname}`;

    const cleanPath = stripLocalePrefix(normalizedPath, locales);

    // Apply prefix based on mode and preserve query/hash
    return `${buildLocalizedPath(cleanPath, targetLocale, defaultLocale, localePrefix)}${suffix}`;
  }

  return localePath;
}
