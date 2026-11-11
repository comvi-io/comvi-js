import {
  defineNuxtRouteMiddleware,
  useRuntimeConfig,
  navigateTo,
  useNuxtApp,
  useRequestHeaders,
} from "#app";
import {
  splitPathAndSuffix,
  stripLocalePrefix,
  extractLocaleFromPath,
  buildLocalizedPath,
  setQueryParamInSuffix,
} from "../utils/locale-path";
import { detectLocale } from "../utils/detect";
import { useLocaleCookie } from "../utils/cookie";
import { resolveAcceptLanguage } from "#build/comvi.detection";

type Navigating = { _comviNavigating?: number; _comviNavigation?: number };

/**
 * One direction: route → instance. Resolves the target's locale with the plugin's
 * resolver, awaits `$i18n.setLocale(target)` (the old locale stays on screen until the
 * target's catalogs settle), records the cookie, and redirects to the URL of the locale
 * on screen when the path does not match it (prefix normalization, or a switch that
 * failed: the instance kept its locale and reported the failure through `onError`).
 *
 * At hydration it does nothing: the server resolved this URL, and the instance starts in
 * the payload's locale.
 */
export default defineNuxtRouteMiddleware(async (to, from?: typeof to) => {
  const nuxtApp = useNuxtApp();
  if (!import.meta.server && nuxtApp.isHydrating && nuxtApp.payload.serverRendered) return;

  const routing = useRuntimeConfig().public.comvi;
  const { locales, defaultLocale, localePrefix, localeDetection } = routing;
  const { pathname, suffix } = splitPathAndSuffix(to.fullPath || to.path);
  // Nuxt internals and API endpoints are not pages.
  if (pathname.startsWith("/_nuxt") || pathname === "/api" || pathname.startsWith("/api/")) return;

  const i18n = nuxtApp.$i18n;
  const cookie = useLocaleCookie();
  const detected = detectLocale(
    routing,
    {
      pathname,
      query: to.query,
      // The first resolution of a visit has no origin: on the server `from` is the target
      // itself, in the browser the router's start location.
      from: import.meta.server ? undefined : from?.path,
      cookie: cookie?.value,
      header: import.meta.server ? (name) => useRequestHeaders([name])[name] : undefined,
    },
    resolveAcceptLanguage,
  );

  const state = nuxtApp as unknown as Navigating;
  // This run cancels a switch still loading: the cookie may hold that switch's target
  // (`<NuxtLinkLocale locale>` writes it before navigating), so it records what renders.
  const cancels = !!state._comviNavigating;
  // A switch to another locale, or ANY navigation while a switch is still loading: every
  // newer navigation supersedes pending work. The router cancels the older navigation,
  // and the last `setLocale()` wins in the core (one to the locale on screen ends the
  // pending switch); the superseded run then records and redirects nothing.
  if (detected.locale !== i18n.locale || state._comviNavigating) {
    const id = (state._comviNavigation = (state._comviNavigation ?? 0) + 1);
    state._comviNavigating = (state._comviNavigating ?? 0) + 1;
    try {
      await i18n.setLocale(detected.locale);
    } catch {
      // Reported through `onError`; the locale on screen stays, and the URL follows it below.
    } finally {
      state._comviNavigating!--;
    }
    if (id !== state._comviNavigation) return;
  }

  const rendered = i18n.locale;
  const value = (!cancels && detected.keep) || rendered;
  if (cookie && cookie.value !== value) cookie.value = value;

  // Prefix modes are applied against the locale that actually rendered.
  const localized = buildLocalizedPath(
    stripLocalePrefix(pathname, locales),
    rendered,
    defaultLocale,
    localePrefix,
  );
  if (localized !== pathname) {
    const queryParam = localeDetection ? localeDetection.queryParam : undefined;
    const keepsQuery =
      extractLocaleFromPath(pathname, locales) !== undefined &&
      queryParam !== undefined &&
      Object.prototype.hasOwnProperty.call(to.query ?? {}, queryParam);
    return navigateTo(
      `${localized}${keepsQuery ? setQueryParamInSuffix(suffix, queryParam!, rendered) : suffix}`,
      { redirectCode: 302 },
    );
  }
});
