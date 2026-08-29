import { NextRequest, NextResponse } from "next/server";
import { extractLocaleFromPath } from "@comvi/locale-routing";
import type { MiddlewareConfig, LocaleDetectionSource } from "./types";
import { createGetPathname } from "../routing/defineRouting";
import type { RoutingConfig } from "../routing/types";
import { getCanonicalPathname, stripLocalePrefix } from "../routing/utils";

// Passes the resolved locale to Server Components.
const LOCALE_HEADER = "x-comvi-locale";

const DEFAULT_DETECTION_ORDER: LocaleDetectionSource[] = ["cookie", "accept-language"];

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
 *   localeDetection: {
 *     order: ['header', 'cookie', 'accept-language'],
 *     headerName: 'x-user-locale',
 *     cookieName: 'MY_LOCALE',
 *   },
 * });
 * ```
 */
export function createMiddleware(config: MiddlewareConfig) {
  const {
    locales,
    defaultLocale,
    localePrefix = "as-needed",
    localeCookie = "NEXT_LOCALE",
    detectLocale: customDetector,
    localeDetection,
  } = config;

  const detectionOrder = localeDetection?.order ?? DEFAULT_DETECTION_ORDER;
  const cookieName = localeDetection?.cookieName ?? localeCookie;
  const cookieSecureConfig = localeDetection?.cookieSecure ?? true;
  const isDev = process.env.NODE_ENV === "development";
  const headerName = localeDetection?.headerName;
  const resolveAcceptLanguage =
    localeDetection?.resolveAcceptLanguage ?? defaultResolveAcceptLanguage;
  const routing = {
    locales,
    defaultLocale,
    localePrefix,
    localeCookie,
    pathnames: config.pathnames ?? {},
  } satisfies Required<RoutingConfig>;
  const getPathname = createGetPathname(routing);

  return function middleware(request: NextRequest): NextResponse {
    const { pathname } = request.nextUrl;

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
          cookieName,
          headerName,
          resolveAcceptLanguage,
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

    if (pathname !== publicPathname) {
      const url = request.nextUrl.clone();
      url.pathname = publicPathname;
      response = NextResponse.redirect(url);
    } else {
      const internalPathname = getInternalPathname(locale, canonicalPathname);
      const middlewareInit = { request: { headers: requestHeaders } };
      if (pathname === internalPathname) {
        response = NextResponse.next(middlewareInit);
      } else {
        const url = request.nextUrl.clone();
        url.pathname = internalPathname;
        response = NextResponse.rewrite(url, middlewareInit);
      }
    }

    response.headers.set(LOCALE_HEADER, locale);

    const existingCookie = request.cookies.get(cookieName)?.value;
    if (existingCookie !== locale) {
      response.cookies.set(cookieName, locale, {
        path: "/",
        maxAge: 365 * 24 * 60 * 60, // 1 year
        sameSite: "lax",
        // Secure in production, disabled in dev so localhost HTTP works
        secure: isDev ? false : cookieSecureConfig,
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
  cookieName: string,
  headerName: string | undefined,
  resolveAcceptLanguage: (
    header: string,
    locales: readonly string[],
    defaultLocale: string,
  ) => string | undefined,
): string | undefined {
  switch (source) {
    case "cookie": {
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
      return resolveAcceptLanguage(acceptLanguage, locales, defaultLocale);
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

/**
 * Handles common cases with a simple parser. For production apps with diverse
 * locales (CJK, regional variants), use @formatjs/intl-localematcher.
 *
 * Matching strategy:
 * 1. Try exact match (e.g., "en-US" matches "en-US")
 * 2. Try base language match (e.g., "en-US" matches "en")
 * 3. Try finding a locale that starts with the language (e.g., "en" matches "en-US")
 */
function defaultResolveAcceptLanguage(
  acceptLanguage: string,
  locales: readonly string[],
  _defaultLocale: string,
): string | undefined {
  // Parse Accept-Language header (e.g., "en-US,en;q=0.9,uk;q=0.8")
  const languages = acceptLanguage
    .split(",")
    .map((lang) => {
      const [code, q = "q=1"] = lang.trim().split(";");
      const quality = parseFloat(q.split("=")[1] || "1");
      return {
        code: code.trim(),
        quality: isNaN(quality) ? 1 : quality,
      };
    })
    .filter(({ code, quality }) => code.length > 0 && quality > 0)
    .sort((a, b) => b.quality - a.quality);

  for (const { code } of languages) {
    const normalizedCode = code.toLowerCase();

    const exactMatch = locales.find((locale) => locale.toLowerCase() === normalizedCode);
    if (exactMatch) return exactMatch;

    const baseLang = normalizedCode.split("-")[0];
    const baseMatch = locales.find((locale) => locale.toLowerCase() === baseLang);
    if (baseMatch) return baseMatch;

    const prefixMatch = locales.find((locale) => locale.toLowerCase().startsWith(baseLang + "-"));
    if (prefixMatch) return prefixMatch;
  }

  return undefined;
}

function getInternalPathname(locale: string, canonicalPathname: string): string {
  return canonicalPathname === "/" ? `/${locale}` : `/${locale}${canonicalPathname}`;
}
