import type { UrlObject } from "url";
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

const getCanonicalPathMatch = (
  pathname: string,
  routing: Required<RoutingConfig>,
  preferredLocale?: string,
): string | undefined => {
  const normalizedPath = normalizePath(pathname);
  const localesToTry = preferredLocale
    ? [preferredLocale, ...routing.locales.filter((locale) => locale !== preferredLocale)]
    : [...routing.locales];

  for (const [canonicalPath, localizedByLocale] of Object.entries(routing.pathnames)) {
    const normalizedCanonicalPath = normalizePath(canonicalPath);

    if (normalizedPath === normalizedCanonicalPath) {
      return normalizedCanonicalPath;
    }

    for (const locale of localesToTry) {
      const localizedPath = localizedByLocale[locale];
      if (localizedPath && normalizePath(localizedPath) === normalizedPath) {
        return normalizedCanonicalPath;
      }
    }
  }

  return undefined;
};

export const stripLocalePrefix = (pathname: string, locales: readonly string[]): string => {
  const normalized = normalizePath(pathname);
  const segments = normalized.split("/").filter(Boolean);
  if (segments.length === 0) return "/";

  const first = segments[0];
  if (locales.includes(first)) {
    const rest = segments.slice(1).join("/");
    return rest ? `/${rest}` : "/";
  }

  return normalized;
};

export const getCanonicalPathname = (
  pathname: string,
  routing: Required<RoutingConfig>,
  preferredLocale?: string,
): string => {
  const normalizedPath = normalizePath(pathname);
  return getCanonicalPathMatch(normalizedPath, routing, preferredLocale) ?? normalizedPath;
};

const splitHref = (href: string): { path: string; suffix: string } => {
  const match = href.match(/[?#]/);
  if (!match || match.index === undefined) {
    return { path: href, suffix: "" };
  }
  const index = match.index;
  return { path: href.slice(0, index), suffix: href.slice(index) };
};

export const localizePathname = (
  pathname: string,
  locale: string,
  routing: Required<RoutingConfig>,
): string => {
  const { path, suffix } = splitHref(pathname);
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
