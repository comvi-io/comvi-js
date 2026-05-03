import {
  defineNuxtRouteMiddleware,
  useRuntimeConfig,
  useState,
  useCookie,
  navigateTo,
  useNuxtApp,
  useRequestHeaders,
} from "#app";
import {
  splitPathAndSuffix,
  stripLocalePrefix,
  extractLocaleFromPath,
  buildLocalizedPath,
} from "../utils/locale-path";
import { resolveAcceptLanguage } from "../utils/resolve-locale";

/**
 * Default browser language detection options
 */
const DEFAULT_DETECT_BROWSER_LANGUAGE = {
  useCookie: true,
  cookieName: "i18n_locale",
  cookieMaxAge: 365 * 24 * 60 * 60, // 1 year
  redirectOnFirstVisit: true,
};

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
  const localeState = useState<string>("i18n-locale");

  const detectConfig =
    detectBrowserLanguage === false
      ? false
      : {
          ...DEFAULT_DETECT_BROWSER_LANGUAGE,
          ...(typeof detectBrowserLanguage === "object" ? detectBrowserLanguage : {}),
        };

  const useCookieForDetection = detectConfig !== false && detectConfig.useCookie === true;

  // Get locale cookie
  const cookieSecure =
    typeof detectBrowserLanguage === "object" && detectBrowserLanguage.cookieSecure !== undefined
      ? detectBrowserLanguage.cookieSecure
      : true; // Secure by default

  const localeCookie = useCookieForDetection
    ? useCookie(cookieName, {
        maxAge:
          typeof detectBrowserLanguage === "object"
            ? detectBrowserLanguage.cookieMaxAge
            : 365 * 24 * 60 * 60,
        path: "/",
        sameSite: "lax",
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

  // URL path has highest priority
  if (pathLocale) {
    detectedLocale = pathLocale;
  }

  // Then cookie (if enabled)
  let detectedSource: "path" | "cookie" | "header" | "fallback" = "fallback";
  if (pathLocale) {
    detectedSource = "path";
  }

  if (!detectedLocale && localeCookie?.value && locales.includes(localeCookie.value)) {
    detectedLocale = localeCookie.value;
    detectedSource = "cookie";
  }

  // Then Accept-Language (server-side only)
  if (!detectedLocale && import.meta.server && detectConfig !== false) {
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
  const resolvedFallbackLocale = locales.includes(fallbackLocale) ? fallbackLocale : defaultLocale;
  const locale =
    detectedLocale && locales.includes(detectedLocale) ? detectedLocale : resolvedFallbackLocale;

  // 3. Handle locale prefix modes using the locale that actually rendered.
  const getRedirectPathForLocale = (targetLocale: string): string | null => {
    const cleanPath = stripLocalePrefix(pathname, locales);
    const localizedPath = buildLocalizedPath(cleanPath, targetLocale, defaultLocale, localePrefix);
    return localizedPath !== pathname ? localizedPath : null;
  };

  // 4. Update i18n instance locale first (important for SSR).
  // This avoids duplicate setLocale calls from the localeState watcher in runtime/plugin.ts.
  const { $i18n } = useNuxtApp();
  if ($i18n && $i18n.locale.value !== locale) {
    try {
      // Await setLocale to ensure translations are loaded before rendering.
      await $i18n.setLocale(locale);
    } catch (error) {
      // Log but don't break navigation — app will render with fallback translations.
      console.warn(
        `[@comvi/nuxt] Failed to switch language to "${locale}":`,
        error instanceof Error ? error.message : error,
      );
    }
  }

  const renderedLocale = $i18n ? $i18n.locale.value : locale;

  // Sync locale state to the language that actually rendered.
  // During SSR this must match the i18n language so the hydrated client
  // starts from the same state as the server HTML. On failure, i18n
  // stays on the previous language, so we must reflect that here.
  localeState.value = renderedLocale;
  if (localeCookie && localeCookie.value !== renderedLocale) {
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
