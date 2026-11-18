import { extractLocaleFromPath, stripLocalePrefix } from "./locale-path";
import { resolveAcceptLanguage as builtInAcceptLanguage } from "./resolve-locale";
import type { NuxtI18nRuntimeConfig, ResolveAcceptLanguage } from "../../types";

type Config = NuxtI18nRuntimeConfig["comvi"];

export interface DetectInput {
  /** The target's pathname; `undefined` for a request that is not a page (a Nitro route). */
  pathname?: string;
  query?: Record<string, unknown>;
  /** The pathname of the navigation's origin; `undefined` on a first (server) resolution. */
  from?: string;
  /** The locale cookie's value. */
  cookie?: string | null;
  /** A request header (lower case); absent in the browser. */
  header?: (name: string) => string | undefined;
}

export interface Detected {
  /** A supported locale. */
  locale: string;
  /**
   * The stored preference a path-implied default keeps in the cookie (the cookie's own
   * value); `undefined`: the cookie records the locale on screen.
   */
  keep?: string;
}

/**
 * The ONE locale resolver (the 0.7 rules, unchanged): the URL path prefix, then
 * `localeDetection.order` (default: the query parameter, the cookie, the
 * Accept-Language header), then `defaultLocale`. Under `as-needed` a prefixless non-root
 * path IS the default locale's URL: it is decided after any `query` sources that lead
 * the order and before the rest. So is the prefixless URL of a locale switch to the
 * default locale, the root path included. Used by the plugin on the server (before the
 * instance exists), the route middleware, and `useTranslation(event)`.
 */
export function detectLocale(
  config: Config,
  input: DetectInput,
  customAcceptLanguage?: ResolveAcceptLanguage,
): Detected {
  const { locales, defaultLocale, localePrefix, localeDetection } = config;
  const { pathname, query = {}, from, cookie, header } = input;
  const accept = (candidate: unknown): string | undefined =>
    typeof candidate === "string" && locales.includes(candidate) ? candidate : undefined;

  const pathLocale = pathname === undefined ? undefined : extractLocaleFromPath(pathname, locales);
  // A locale switch to the default locale: a navigation from a locale-prefixed URL to the
  // SAME page without a prefix (what `useSwitchLocalePath()` returns for the default
  // locale under `as-needed`). The user's explicit choice: the URL decides, the root path
  // included, and the cookie records it.
  const switchToDefault =
    localePrefix === "as-needed" &&
    pathname !== undefined &&
    pathLocale === undefined &&
    from !== undefined &&
    extractLocaleFromPath(from, locales) !== undefined &&
    stripLocalePrefix(from, locales) === pathname;
  const impliedDefault =
    switchToDefault ||
    (localePrefix === "as-needed" && pathname !== undefined && pathname !== "/" && pathname !== "");

  let detected = pathLocale;
  let fromPath = detected !== undefined;
  const queryParam = localeDetection ? localeDetection.queryParam : undefined;
  for (const source of localeDetection ? localeDetection.order : []) {
    if (detected) break;
    // An explicit query parameter (e.g. ?lang=de) beats the implied default of a
    // prefixless path, but no other source does.
    if (source !== "query" && impliedDefault) break;
    if (source === "query") {
      const raw = queryParam ? query[queryParam] : undefined;
      detected = accept(Array.isArray(raw) ? raw[0] : raw);
    } else if (source === "cookie") {
      detected = accept(cookie);
    } else if (header && source === "header") {
      const name = localeDetection ? localeDetection.headerName?.toLowerCase() : undefined;
      detected = name ? accept(header(name)) : undefined;
    } else if (header && source === "accept-language") {
      // The matcher's answer is taken as-is, as in `@comvi/next`: one outside `locales`
      // ends detection and falls back below.
      const value = header("accept-language");
      detected = value
        ? (customAcceptLanguage ?? builtInAcceptLanguage)(value, locales, defaultLocale)
        : undefined;
    }
  }
  if (!detected && impliedDefault) {
    detected = defaultLocale;
    fromPath = true;
  }
  const locale = detected && locales.includes(detected) ? detected : defaultLocale;
  // A path-implied default keeps a stored preference (the cookie) for another locale, unless
  // it is the explicit switch to the default locale.
  const stored = accept(cookie);
  const keep =
    fromPath && pathLocale === undefined && !switchToDefault && stored !== locale
      ? stored
      : undefined;
  return { locale, keep };
}
