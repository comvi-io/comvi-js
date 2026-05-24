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
} from "../utils/locale-path";
import { resolveAcceptLanguage } from "../utils/resolve-locale";
import { isServer } from "../utils/runtime";
import { DEFAULT_DETECT_BROWSER_LANGUAGE } from "../defaults";

/**
 * Global route middleware for locale detection and URL prefix handling
 *
 * This middleware:
 * 1. Detects locale from URL path
 * 2. Falls back to cookie, then Accept-Language header
 * 3. Handles URL prefix modes (always, as-needed, never)
 * 4. Persists locale in cookie
 * 5. Syncs locale with Nuxt state
 */
export default defineNuxtRouteMiddleware(async (to) => {
  const config = useRuntimeConfig();
  const { locales, defaultLocale, localePrefix, cookieName, detectBrowserLanguage } =
    config.public.comvi;

  // Get locale state
  const localeState = useLocaleState();

  const detectConfig =
    detectBrowserLanguage === false
      ? false
      : {
          ...DEFAULT_DETECT_BROWSER_LANGUAGE,
          ...(typeof detectBrowserLanguage === "object" ? detectBrowserLanguage : {}),
        };

  const useCookieForDetection = detectConfig !== false && detectConfig.useCookie === true;

  // Get locale cookie
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

  // 1. Extract locale from URL path
  const pathLocale = extractLocaleFromPath(pathname, locales);

  // 2. Detect locale from various sources
  let detectedLocale: string | undefined;
  let detectedSource: "path" | "cookie" | "header" | "fallback" = "fallback";

  if (pathLocale) {
    detectedLocale = pathLocale;
    detectedSource = "path";
  } else if (localePrefix === "as-needed" && pathname !== "/" && pathname !== "") {
    detectedLocale = defaultLocale;
    detectedSource = "path";
  }

  if (!detectedLocale && localeCookie?.value && locales.includes(localeCookie.value)) {
    detectedLocale = localeCookie.value;
    detectedSource = "cookie";
  }

  // Then Accept-Language (server-side only)
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

  // Fallback to default locale
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

  // 3. Handle locale prefix modes using the locale that actually rendered.
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

  // 5. Redirect if needed
  // `redirectOnFirstVisit` only gates redirects triggered by header detection.
  // Path-based redirects and route normalization should still happen regardless.
  const allowHeaderDetectionRedirect =
    detectConfig === false || detectConfig.redirectOnFirstVisit !== false;
  const allowFirstVisitRedirect = detectedSource !== "header" || allowHeaderDetectionRedirect;
  const redirectPath = getRedirectPathForLocale(renderedLocale);

  if (redirectPath && redirectPath !== pathname && (pathLocale || allowFirstVisitRedirect)) {
    return navigateTo(`${redirectPath}${suffix}`, { redirectCode: 302 });
  }
});
