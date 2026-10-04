import { NextRequest, NextResponse } from "next/server";
import {
  extractLocaleFromPath,
  normalizeRoutingOptions,
  resolveAcceptLanguage,
} from "@comvi/locale-routing";
import type { MiddlewareConfig, LocaleDetectionSource } from "./types";
import { createGetPathname, NEXT_LOCALE_COOKIE } from "../routing/defineRouting";
import type { RoutingConfig } from "../routing/types";
import { getCanonicalPathname, stripLocalePrefix } from "../routing/utils";

// Passes the resolved locale to Server Components.
const LOCALE_HEADER = "x-comvi-locale";

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
  // Names, shapes and defaults come from the one schema `@comvi/nuxt` uses too.
  const {
    locales,
    defaultLocale,
    localePrefix,
    localeCookie: cookie,
    localeDetection: detection,
  } = normalizeRoutingOptions(config, { cookieNameDefault: NEXT_LOCALE_COOKIE });
  const { detectLocale: customDetector } = config;

  const detectionOrder = detection ? detection.order : [];
  const isDev = process.env.NODE_ENV === "development";
  const headerName = detection ? detection.headerName : undefined;
  const queryParam = detection ? detection.queryParam : undefined;
  // The shared matcher from the workspace locale-routing package, which
  // `@comvi/nuxt` vendors the same source of. Its rules are documented there,
  // once, for both frameworks — see `docs/design/next-nuxt-parity.md`.
  const resolveHeader =
    (detection ? detection.resolveAcceptLanguage : undefined) ?? resolveAcceptLanguage;
  const routing = {
    locales,
    defaultLocale,
    localePrefix,
    localeCookie: cookie,
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
