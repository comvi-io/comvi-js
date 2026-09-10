import type { UrlObject } from "url";
import { splitPathAndSuffix, stripLocalePrefix } from "@comvi/locale-routing";
import type { RoutingConfig } from "./types";
import { createGetPathname } from "./defineRouting";

const getPathnameCache = new WeakMap<
  Required<RoutingConfig>,
  ReturnType<typeof createGetPathname>
>();

const isExternalHref = (href: string): boolean => {
  return /^[a-z][a-z0-9+.-]*:/i.test(href) || href.startsWith("//");
};

const isRelativeFragmentOrQuery = (href: string): boolean => {
  return href.startsWith("#") || href.startsWith("?");
};

const normalizePath = (path: string): string => {
  if (!path) return "/";
  return path.startsWith("/") ? path : `/${path}`;
};

/**
 * Split a path into the key the `pathnames` map is compared against and the
 * trailing slash to re-attach afterwards.
 *
 * `@comvi/locale-routing` preserves trailing slashes and never rewrites
 * interior bytes, so `/de/about/` strips to `/about/` and `/en//about` to
 * `//about`. Comparing those raw against the map means every cosmetic-slash
 * variant of a URL misses its slug and loses the internal rewrite. The
 * comparison therefore runs on the collapsed, slash-trimmed form while the
 * RESULT keeps the trailing slash the input had.
 */
const splitTrailingSlash = (path: string): { key: string; trailingSlash: string } => {
  const collapsed = path.includes("//") ? path.replace(/\/{2,}/g, "/") : path;
  return collapsed.length > 1 && collapsed.endsWith("/")
    ? { key: collapsed.slice(0, -1), trailingSlash: "/" }
    : { key: collapsed, trailingSlash: "" };
};

const getCanonicalPathMatch = (
  pathname: string,
  routing: Required<RoutingConfig>,
  preferredLocale?: string,
): string | undefined => {
  const { key, trailingSlash } = splitTrailingSlash(normalizePath(pathname));
  const localesToTry = preferredLocale
    ? [preferredLocale, ...routing.locales.filter((locale) => locale !== preferredLocale)]
    : [...routing.locales];
  // The root canonical path is already `/`; appending the slash would make `//`.
  const withTrailingSlash = (canonical: string): string =>
    canonical === "/" ? canonical : `${canonical}${trailingSlash}`;

  for (const [canonicalPath, localizedByLocale] of Object.entries(routing.pathnames)) {
    const normalizedCanonicalPath = normalizePath(canonicalPath);

    if (key === normalizedCanonicalPath) {
      return withTrailingSlash(normalizedCanonicalPath);
    }

    for (const locale of localesToTry) {
      const localizedPath = localizedByLocale[locale];
      if (localizedPath && normalizePath(localizedPath) === key) {
        return withTrailingSlash(normalizedCanonicalPath);
      }
    }
  }

  return undefined;
};

export { stripLocalePrefix };

export const getCanonicalPathname = (
  pathname: string,
  routing: Required<RoutingConfig>,
  preferredLocale?: string,
): string => {
  const normalizedPath = normalizePath(pathname);
  return getCanonicalPathMatch(normalizedPath, routing, preferredLocale) ?? normalizedPath;
};

export const localizePathname = (
  pathname: string,
  locale: string,
  routing: Required<RoutingConfig>,
): string => {
  const { pathname: path, suffix } = splitPathAndSuffix(pathname);
  const basePath = stripLocalePrefix(path, routing.locales);
  const canonicalPath = getCanonicalPathname(basePath, routing, locale);
  let getPathname = getPathnameCache.get(routing);
  if (!getPathname) {
    getPathname = createGetPathname(routing);
    getPathnameCache.set(routing, getPathname);
  }
  const localized = getPathname({ locale, href: canonicalPath });
  return `${localized}${suffix}`;
};

export const localizeHref = (
  href: string,
  locale: string,
  routing?: Required<RoutingConfig>,
): string => {
  if (isExternalHref(href)) return href;
  if (isRelativeFragmentOrQuery(href)) return href;
  if (!routing) {
    const normalized = normalizePath(href);
    return `/${locale}${normalized === "/" ? "" : normalized}`;
  }
  return localizePathname(href, locale, routing);
};

export const localizeUrlObject = (
  href: UrlObject,
  locale: string,
  routing?: Required<RoutingConfig>,
): UrlObject => {
  if (href.protocol) {
    return href;
  }
  const pathname = typeof href.pathname === "string" ? href.pathname : "/";
  // The same guard `localizeHref` applies. A `//host/path` pathname is a
  // protocol-relative URL, not a path to prefix: without this it came back
  // with a doubled locale prefix (`//de/about` -> `/de//de/about`).
  if (isExternalHref(pathname)) {
    return href;
  }
  if (!routing) {
    const normalized = normalizePath(pathname);
    return {
      ...href,
      pathname: `/${locale}${normalized === "/" ? "" : normalized}`,
    };
  }
  return {
    ...href,
    pathname: localizePathname(pathname, locale, routing),
  };
};
