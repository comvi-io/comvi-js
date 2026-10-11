import { useRuntimeConfig, useRouter } from "#app";
import { useLocaleState } from "../utils/locale-state";
import type { RouteLocationRaw } from "vue-router";
import {
  stripLocalePrefix,
  buildLocalizedPath,
  splitPathAndSuffix,
  isExternalTarget,
  isQueryOrFragmentOnly,
} from "../utils/locale-path";

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
 * The path the CALLER wrote, if they wrote one at all — the string form, or a
 * route object's own `path`. A named route resolves through the router by name,
 * and a route object carrying only `query`/`hash` is a vue-router location
 * relative to the route the user is on, so neither has a caller-written path
 * for the external/pathless guard to judge.
 *
 * This is where the string and the object form deliberately part company, and
 * the difference is the caller's own semantics, not an oversight:
 *
 * - A pathless STRING (`"?tab=billing"`, `"#details"`) is returned untouched.
 *   The browser resolves it against the current, already localized document
 *   URL, so there is nothing to rewrite — next's `localizeHref` does the same.
 * - A pathless OBJECT (`{ query: { tab: "billing" } }`) goes to the router,
 *   which resolves it against the current route, and the result is localized:
 *   `/en/pricing` + `{ query: { a: "b" } }` with locale `de` gives
 *   `/de/pricing?a=b`. That is what a vue-router location means. Next's
 *   `localizeUrlObject` would answer `/de` here because it defaults a missing
 *   pathname to `/`; matching it would silently drop the page the caller is on,
 *   so this composable does NOT follow next on the object form.
 */
const rawTargetPath = (target: RouteLocationRaw): string | undefined => {
  if (typeof target === "string") {
    return target;
  }
  if (typeof target === "object" && target !== null) {
    if ("name" in target && target.name) {
      return undefined;
    }
    if ("path" in target && typeof target.path === "string") {
      return target.path;
    }
  }
  return undefined;
};

/**
 * Write a route object's `query` and `hash` onto a target the router never got
 * to see. Assembled in URL order — query before fragment — so an external
 * target keeps the shape the caller would have written by hand:
 *
 * - a query joins one the target already carries with `&` rather than opening a
 *   second `?`;
 * - a fragment the target already carries wins, and `hash` is dropped rather
 *   than appended as a second `#`.
 */
const appendQueryAndHash = (
  target: string,
  location: { query?: unknown; hash?: unknown },
): string => {
  const fragmentIndex = target.indexOf("#");
  const base = fragmentIndex === -1 ? target : target.slice(0, fragmentIndex);
  const ownFragment = fragmentIndex === -1 ? "" : target.slice(fragmentIndex);

  const query = toQueryString(location.query as QueryRecord | undefined);
  const queryString = query && base.includes("?") ? `&${query.slice(1)}` : query;

  const hash = typeof location.hash === "string" ? location.hash : "";
  const fragment = ownFragment || (hash ? (hash.startsWith("#") ? hash : `#${hash}`) : "");

  return `${base}${queryString}${fragment}`;
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

    // Only an app-internal path is localized, and the check runs BEFORE the
    // router: vue-router resolves `{ path: "https://example.com/a" }` as a
    // RELATIVE path against the current route, so waiting for `fullPath` meant
    // judging `/en/https://example.com/a` — already mangled, and handing that
    // back verbatim. An external URL, a protocol-relative host and a bare
    // `?query` / `#fragment` are returned as the caller wrote them; a route
    // object's `query`/`hash` are written onto the target here, since the
    // router never gets to append them.
    const written = rawTargetPath(path);
    if (written !== undefined && (isExternalTarget(written) || isQueryOrFragmentOnly(written))) {
      return typeof path === "string" ? written : appendQueryAndHash(written, path);
    }

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

    // A leading run of slashes left behind by prefix stripping (`/en//evil.com`
    // for the default locale under `as-needed`, or any locale under `never`)
    // would come back as a protocol-relative `//evil.com` — an off-site link
    // from what the app wrote as a path. Collapse the leading run only;
    // interior doubled slashes stay as the caller wrote them, as in next's
    // `localizePathname`.
    const cleanPath = stripLocalePrefix(normalizedPath, locales).replace(/^\/{2,}/, "/");

    // Apply prefix based on mode and preserve query/hash
    return `${buildLocalizedPath(cleanPath, targetLocale, defaultLocale, localePrefix)}${suffix}`;
  }

  return localePath;
}
