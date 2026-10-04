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
import { resolveAcceptLanguage as customResolveAcceptLanguage } from "#build/comvi.detection";

/**
 * Global route middleware for locale detection and URL prefix handling.
 *
 * Locale precedence: the URL path prefix, then `localeDetection.order`
 * (default: the query parameter, the cookie, the Accept-Language header), then
 * `defaultLocale`. Under `as-needed` a prefixless non-root path IS the default
 * locale's URL: it is decided after any `query` sources that lead the order
 * and before the rest.
 */
export default defineNuxtRouteMiddleware(async (to) => {
  const config = useRuntimeConfig();
  const {
    locales,
    defaultLocale,
    localePrefix,
    localeCookie: cookieConfig,
    localeDetection: detectConfig,
  } = config.public.comvi;

  const localeState = useLocaleState();

  const localeCookie = cookieConfig
    ? useCookie(cookieConfig.name, {
        maxAge: cookieConfig.maxAge,
        path: "/",
        sameSite: cookieConfig.sameSite,
        domain: cookieConfig.domain,
        // Secure in production, disabled in dev so localhost HTTP works
        secure: import.meta.dev ? false : cookieConfig.secure,
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
  const queryParam = detectConfig ? detectConfig.queryParam : undefined;
  const hasQueryParam =
    queryParam !== undefined && Object.prototype.hasOwnProperty.call(to.query ?? {}, queryParam);
  const isPathImpliedDefaultCandidate =
    localePrefix === "as-needed" && pathname !== "/" && pathname !== "";

  if (pathLocale) {
    detectedLocale = pathLocale;
    detectedSource = "path";
  }

  const accept = (candidate: unknown): string | undefined =>
    typeof candidate === "string" && locales.includes(candidate) ? candidate : undefined;

  for (const source of detectConfig ? detectConfig.order : []) {
    if (detectedLocale) break;
    // An explicit query parameter (e.g. ?lang=de) beats the implied default of
    // a prefixless path, but no other source does.
    if (source !== "query" && isPathImpliedDefaultCandidate) break;
    if (source === "query") {
      const raw = queryParam ? to.query?.[queryParam] : undefined;
      detectedLocale = accept(Array.isArray(raw) ? raw[0] : raw);
      if (detectedLocale) detectedSource = "query";
    } else if (source === "cookie") {
      detectedLocale = accept(localeCookie?.value);
      if (detectedLocale) detectedSource = "cookie";
    } else if (isServer()) {
      // Request headers exist on the server only.
      if (source === "header") {
        const headerName = detectConfig ? detectConfig.headerName : undefined;
        detectedLocale = headerName
          ? accept(useRequestHeaders([headerName])[headerName])
          : undefined;
      } else {
        // The matcher's answer is taken as-is, as in `@comvi/next`: one outside
        // `locales` ends detection and falls back below.
        const acceptLanguage = useRequestHeaders(["accept-language"])["accept-language"];
        detectedLocale = acceptLanguage
          ? (customResolveAcceptLanguage ?? resolveAcceptLanguage)(
              acceptLanguage,
              locales,
              defaultLocale,
            )
          : undefined;
      }
      if (detectedLocale) detectedSource = "header";
    }
  }

  if (!detectedLocale && isPathImpliedDefaultCandidate) {
    detectedLocale = defaultLocale;
    detectedSource = "path";
  }

  const locale =
    detectedLocale && locales.includes(detectedLocale) ? detectedLocale : defaultLocale;

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

  const redirectPath = getRedirectPathForLocale(renderedLocale);

  if (redirectPath && redirectPath !== pathname) {
    const redirectSuffix =
      pathLocale && queryParam && hasQueryParam
        ? setQueryParamInSuffix(suffix, queryParam, renderedLocale)
        : suffix;
    return navigateTo(`${redirectPath}${redirectSuffix}`, { redirectCode: 302 });
  }
});
