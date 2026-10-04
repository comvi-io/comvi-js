import { NextRequest, NextResponse } from "next/server";
import { extractLocaleFromPath, resolveAcceptLanguage } from "@comvi/locale-routing";
import type { MiddlewareConfig, LocaleDetectionSource, LocaleCookieOptions } from "./types";
import { createGetPathname } from "../routing/defineRouting";
import type { RoutingConfig } from "../routing/types";
import { getCanonicalPathname, stripLocalePrefix } from "../routing/utils";

// Passes the resolved locale to Server Components.
const LOCALE_HEADER = "x-comvi-locale";

// `query` is inert until `queryParam` is set, so apps that set nothing read
// the cookie, then Accept-Language, exactly as before it was a source.
const DEFAULT_DETECTION_ORDER: LocaleDetectionSource[] = ["query", "cookie", "accept-language"];
const DEFAULT_COOKIE_NAME = "NEXT_LOCALE";

declare const __DEV__: boolean | undefined;
const IS_DEV = typeof __DEV__ !== "undefined" && __DEV__;

/**
 * Creates i18n middleware for Next.js.
 *
 * @example
 * ```typescript
 * // middleware.ts - Basic usage
 * import { createMiddleware } from '@comvi/next/middleware';
 * import { routing } from './i18n/routing';
 *
 * export default createMiddleware(routing);
 * ```
 *
 * @example
 * ```typescript
 * // middleware.ts - Custom detection order
 * export default createMiddleware({
 *   ...routing,
 *   localeCookie: 'MY_LOCALE',
 *   localeDetection: {
 *     order: ['header', 'cookie', 'accept-language'],
 *     headerName: 'x-user-locale',
 *   },
 * });
 * ```
 */
export function createMiddleware(config: MiddlewareConfig) {
  const {
    locales,
    defaultLocale,
    localePrefix = "as-needed",
    detectLocale: customDetector,
    localeDetection,
  } = config;

  const detection = localeDetection === false ? undefined : localeDetection;
  const detectionOrder =
    localeDetection === false ? [] : (detection?.order ?? DEFAULT_DETECTION_ORDER);
  const cookie = resolveLocaleCookie(config.localeCookie, detection);
  const isDev = process.env.NODE_ENV === "development";
  const headerName = detection?.headerName;
  const queryParam = detection?.queryParam;
  // The shared matcher from the workspace locale-routing package, which
  // `@comvi/nuxt` vendors the same source of. Its rules are documented there,
  // once, for both frameworks — see `docs/design/next-nuxt-parity.md`.
  const resolveHeader = detection?.resolveAcceptLanguage ?? resolveAcceptLanguage;
  const routing = {
    locales,
    defaultLocale,
    localePrefix,
    localeCookie: config.localeCookie ?? DEFAULT_COOKIE_NAME,
    pathnames: config.pathnames ?? {},
  } satisfies Required<RoutingConfig>;
  const getPathname = createGetPathname(routing);

  return function middleware(request: NextRequest): NextResponse {
    // Duplicate slashes are not a route: `//de/about` is the same request as
    // `/de/about` to every router. `stripLocalePrefix` refuses to strip a
    // prefix that is not at the very start of the path (deliberately — it
    // never rewrites interior bytes), so without collapsing them here the
    // locale prefix stayed in the canonical path and a second one was applied
    // on the way out: `//de/about` redirected to `/de//de/about`. Next's own
    // normalization catches these before middleware in the default config;
    // this keeps the answer right when `skipTrailingSlashRedirect` is on.
    const rawPathname = request.nextUrl.pathname;
    const pathname = rawPathname.includes("//") ? rawPathname.replace(/\/{2,}/g, "/") : rawPathname;

    if (shouldSkipPath(pathname)) {
      return NextResponse.next();
    }

    const pathLocale = extractLocaleFromPath(pathname, locales);

    // Precedence: custom detector, then the URL path, then the configured
    // sources in order, then `defaultLocale`.
    let detectedLocale: string | undefined;

    if (customDetector) {
      detectedLocale = customDetector(request);
    }

    if (!detectedLocale && pathLocale) {
      detectedLocale = pathLocale;
    }

    if (!detectedLocale) {
      for (const source of detectionOrder) {
        const detected = detectFromSource(
          request,
          source,
          locales,
          defaultLocale,
          cookie ? cookie.name : undefined,
          headerName,
          queryParam,
          resolveHeader,
        );
        if (detected) {
          detectedLocale = detected;
          break;
        }
      }
    }

    const locale =
      detectedLocale && locales.includes(detectedLocale) ? detectedLocale : defaultLocale;

    const requestHeaders = new Headers(request.headers);
    requestHeaders.set(LOCALE_HEADER, locale);
    const canonicalPathname = getCanonicalPathname(
      stripLocalePrefix(pathname, locales),
      routing,
      locale,
    );

    const publicPathname = getPathname({ locale, href: canonicalPathname });
    let response: NextResponse;

    // Both comparisons ignore a single trailing slash. Whether a URL keeps one
    // is Next's `trailingSlash` decision, not ours, and comparing literally
    // made `/de/` redirect to ITSELF forever: the public path is `/de`, but
    // `nextUrl.clone()` re-serializes it with the slash the request carried,
    // so the two strings never converged.
    if (withoutTrailingSlash(pathname) !== withoutTrailingSlash(publicPathname)) {
      const url = request.nextUrl.clone();
      url.pathname = publicPathname;
      response = NextResponse.redirect(url);
    } else {
      const internalPathname = getInternalPathname(locale, canonicalPathname);
      const middlewareInit = { request: { headers: requestHeaders } };
      if (withoutTrailingSlash(pathname) === withoutTrailingSlash(internalPathname)) {
        response = NextResponse.next(middlewareInit);
      } else {
        const url = request.nextUrl.clone();
        url.pathname = internalPathname;
        response = NextResponse.rewrite(url, middlewareInit);
      }
    }

    response.headers.set(LOCALE_HEADER, locale);

    if (cookie && request.cookies.get(cookie.name)?.value !== locale) {
      response.cookies.set(cookie.name, locale, {
        path: "/",
        maxAge: cookie.maxAge,
        sameSite: cookie.sameSite,
        // Secure in production, disabled in dev so localhost HTTP works
        secure: isDev ? false : cookie.secure,
        ...(cookie.domain === undefined ? {} : { domain: cookie.domain }),
      });
    }

    return response;
  };
}

function detectFromSource(
  request: NextRequest,
  source: LocaleDetectionSource,
  locales: readonly string[],
  defaultLocale: string,
  cookieName: string | undefined,
  headerName: string | undefined,
  queryParam: string | undefined,
  resolveHeader: (
    header: string,
    locales: readonly string[],
    defaultLocale: string,
  ) => string | undefined,
): string | undefined {
  switch (source) {
    case "query": {
      if (!queryParam) return undefined;
      const queryValue = request.nextUrl.searchParams.get(queryParam);
      if (queryValue && locales.includes(queryValue)) {
        return queryValue;
      }
      return undefined;
    }
    case "cookie": {
      if (!cookieName) return undefined;
      const cookieValue = request.cookies.get(cookieName)?.value;
      if (cookieValue && locales.includes(cookieValue)) {
        return cookieValue;
      }
      return undefined;
    }
    case "header": {
      if (!headerName) return undefined;
      const headerValue = request.headers.get(headerName);
      if (headerValue && locales.includes(headerValue)) {
        return headerValue;
      }
      return undefined;
    }
    case "accept-language": {
      const acceptLanguage = request.headers.get("accept-language");
      if (!acceptLanguage) return undefined;
      return resolveHeader(acceptLanguage, locales, defaultLocale);
    }
    default:
      return undefined;
  }
}

type ResolvedLocaleCookie = Required<Omit<LocaleCookieOptions, "domain">> &
  Pick<LocaleCookieOptions, "domain">;

/**
 * `localeCookie` in its one resolved shape, or `false` for no cookie at all.
 *
 * `localeDetection.cookieName` / `.cookieSecure` are the 0.4 spellings, kept as
 * aliases through 0.5. `defineRouting` fills `localeCookie` with the default
 * name, so a default-valued `localeCookie` does not count as given: the alias
 * still applies there, as it always has. Anything else given beside an alias
 * wins, and development says so.
 */
function resolveLocaleCookie(
  localeCookie: MiddlewareConfig["localeCookie"],
  detection: Exclude<MiddlewareConfig["localeDetection"], false>,
): ResolvedLocaleCookie | false {
  const aliasName = detection?.cookieName;
  const aliasSecure = detection?.cookieSecure;
  const aliasUsed = aliasName !== undefined || aliasSecure !== undefined;
  const canonicalGiven = localeCookie !== undefined && localeCookie !== DEFAULT_COOKIE_NAME;

  if (IS_DEV && aliasUsed) {
    console.warn(
      canonicalGiven
        ? "[@comvi/next] Both `localeCookie` and the deprecated `localeDetection.cookieName`/`cookieSecure` are set. `localeCookie` wins. Drop the `localeDetection` cookie keys: they are removed in 0.6."
        : "[@comvi/next] `localeDetection.cookieName`/`cookieSecure` are deprecated. Use `localeCookie: { name, secure }`: the old keys are removed in 0.6.",
    );
  }

  if (localeCookie === false) return false;

  const options: LocaleCookieOptions =
    typeof localeCookie === "string"
      ? { name: localeCookie }
      : typeof localeCookie === "object"
        ? localeCookie
        : {};
  const useAlias = aliasUsed && !canonicalGiven;

  return {
    name: (useAlias ? aliasName : undefined) ?? options.name ?? DEFAULT_COOKIE_NAME,
    maxAge: options.maxAge ?? 365 * 24 * 60 * 60, // 1 year
    secure: (useAlias ? aliasSecure : undefined) ?? options.secure ?? true,
    sameSite: options.sameSite ?? "lax",
    domain: options.domain,
  };
}

/**
 * Static asset filtering is expected to be handled by Next.js matcher config.
 */
function shouldSkipPath(pathname: string): boolean {
  const isApiPath = pathname === "/api" || pathname.startsWith("/api/");
  return pathname.startsWith("/_next") || isApiPath;
}

/** Drop a single trailing slash; the root path keeps its only slash. */
function withoutTrailingSlash(pathname: string): string {
  return pathname.length > 1 && pathname.endsWith("/") ? pathname.slice(0, -1) : pathname;
}

function getInternalPathname(locale: string, canonicalPathname: string): string {
  return canonicalPathname === "/" ? `/${locale}` : `/${locale}${canonicalPathname}`;
}
