import {
  defineNuxtRouteMiddleware,
  useRuntimeConfig,
  useCookie,
  navigateTo,
  useNuxtApp,
  useRequestHeaders,
} from "#app";
import { useLocaleState } from "../utils/locale-state";
import {
  splitPathAndSuffix,
  stripLocalePrefix,
  extractLocaleFromPath,
  buildLocalizedPath,
  setQueryParamInSuffix,
} from "../utils/locale-path";
import { resolveAcceptLanguage } from "../utils/resolve-locale";
import { isServer } from "../utils/runtime";
import { DEFAULT_DETECT_BROWSER_LANGUAGE } from "../defaults";

/**
/**
 * Global route middleware for locale detection and URL prefix handling.
 *
 * Locale precedence: the URL path prefix, then the configured query parameter,
 * then the cookie, then the Accept-Language header, then `defaultLocale`.
 */
export default defineNuxtRouteMiddleware(async (to) => {
  const config = useRuntimeConfig();
  const { locales, defaultLocale, localePrefix, cookieName, detectBrowserLanguage } =
    config.public.comvi;

  const localeState = useLocaleState();

  const detectConfig =
    detectBrowserLanguage === false
      ? false
      : {
          ...DEFAULT_DETECT_BROWSER_LANGUAGE,
          ...(typeof detectBrowserLanguage === "object" ? detectBrowserLanguage : {}),
        };

  const useCookieForDetection = detectConfig !== false && detectConfig.useCookie === true;

  const detectCfg = typeof detectBrowserLanguage === "object" ? detectBrowserLanguage : undefined;
  const cookieSecure = detectCfg?.cookieSecure ?? true;

  const localeCookie = useCookieForDetection
    ? useCookie(cookieName, {
        maxAge: detectCfg?.cookieMaxAge ?? DEFAULT_DETECT_BROWSER_LANGUAGE.cookieMaxAge,
        path: "/",
        sameSite: detectCfg?.sameSite ?? "lax",
        domain: detectCfg?.domain,
        // Secure in production, disabled in dev so localhost HTTP works
        secure: import.meta.dev ? false : cookieSecure,
      })
    : null;

  const { pathname, suffix } = splitPathAndSuffix(to.fullPath || to.path);

  // Skip Nuxt internals and API endpoints only.
  // Keep routes like /apix or /john.doe processable by i18n middleware.
  const isApiPath = pathname === "/api" || pathname.startsWith("/api/");
  if (pathname.startsWith("/_nuxt") || isApiPath) {
    return;
  }

  const pathLocale = extractLocaleFromPath(pathname, locales);

  let detectedLocale: string | undefined;
  let detectedSource: "path" | "query" | "cookie" | "header" | "fallback" = "fallback";
  const queryParam = detectConfig !== false ? detectConfig.queryParam : undefined;
  const rawQueryValue = queryParam ? to.query?.[queryParam] : undefined;
  const hasQueryParam =
    queryParam !== undefined && Object.prototype.hasOwnProperty.call(to.query ?? {}, queryParam);

  if (pathLocale) {
    detectedLocale = pathLocale;
    detectedSource = "path";
  }

  // Explicit query parameter (e.g. ?lang=de) beats the implied default of a
  // prefixless path and stored preferences, but not an explicit path prefix.
  if (!detectedLocale && queryParam) {
    const queryLocale = Array.isArray(rawQueryValue) ? rawQueryValue[0] : rawQueryValue;
    if (typeof queryLocale === "string" && locales.includes(queryLocale)) {
      detectedLocale = queryLocale;
      detectedSource = "query";
    }
  }

  if (!detectedLocale && localePrefix === "as-needed" && pathname !== "/" && pathname !== "") {
    detectedLocale = defaultLocale;
    detectedSource = "path";
  }

  if (!detectedLocale && localeCookie?.value && locales.includes(localeCookie.value)) {
    detectedLocale = localeCookie.value;
    detectedSource = "cookie";
  }

  // Accept-Language is server-side only.
  if (!detectedLocale && isServer() && detectConfig !== false) {
    const headers = useRequestHeaders(["accept-language"]);
    const acceptLanguage = headers["accept-language"];
    if (acceptLanguage) {
      detectedLocale = resolveAcceptLanguage(acceptLanguage, locales);
      if (detectedLocale) {
        detectedSource = "header";
      }
    }
  }

  const fallbackLocale =
    detectConfig && "fallbackLocale" in detectConfig && detectConfig.fallbackLocale
      ? detectConfig.fallbackLocale
      : defaultLocale;
  const resolvedFallbackLocale = Array.isArray(fallbackLocale)
    ? (fallbackLocale.find((locale) => locales.includes(locale)) ?? defaultLocale)
    : locales.includes(fallbackLocale)
      ? fallbackLocale
      : defaultLocale;
  const locale =
    detectedLocale && locales.includes(detectedLocale) ? detectedLocale : resolvedFallbackLocale;

  // Prefix modes are applied against the locale that actually rendered.
  const getRedirectPathForLocale = (targetLocale: string): string | null => {
    const cleanPath = stripLocalePrefix(pathname, locales);
    const localizedPath = buildLocalizedPath(cleanPath, targetLocale, defaultLocale, localePrefix);
    return localizedPath !== pathname ? localizedPath : null;
  };

  const isPathImpliedDefault = detectedSource === "path" && pathLocale === undefined;
  const preservedPreference =
    isPathImpliedDefault &&
    localeCookie?.value &&
    locales.includes(localeCookie.value) &&
    localeCookie.value !== locale
      ? localeCookie.value
      : undefined;

  const { $i18n } = useNuxtApp();
  if ($i18n && $i18n.locale.value !== locale) {
    try {
      await $i18n.setLocale(locale);
    } catch (error) {
      console.warn(
        `[@comvi/nuxt] Failed to switch language to "${locale}":`,
        error instanceof Error ? error.message : error,
      );
    }
  }

  const renderedLocale = $i18n ? $i18n.locale.value : locale;

  localeState.value = renderedLocale;

  if (preservedPreference !== undefined) {
    if (localeCookie && localeCookie.value !== preservedPreference) {
      localeCookie.value = preservedPreference;
    }
  } else if (localeCookie && localeCookie.value !== renderedLocale) {
    localeCookie.value = renderedLocale;
  }

  // `redirectOnFirstVisit` only gates redirects triggered by header detection.
  // Path-based redirects and route normalization should still happen regardless.
  const allowHeaderDetectionRedirect =
    detectConfig === false || detectConfig.redirectOnFirstVisit !== false;
  const allowFirstVisitRedirect = detectedSource !== "header" || allowHeaderDetectionRedirect;
  const redirectPath = getRedirectPathForLocale(renderedLocale);

  if (redirectPath && redirectPath !== pathname && (pathLocale || allowFirstVisitRedirect)) {
    const redirectSuffix =
      pathLocale && queryParam && hasQueryParam
        ? setQueryParamInSuffix(suffix, queryParam, renderedLocale)
        : suffix;
    return navigateTo(`${redirectPath}${redirectSuffix}`, { redirectCode: 302 });
  }
});
