import { defineNuxtPlugin, useRequestHeaders, useRuntimeConfig } from "#app";
import { createI18n, useI18n, type VueI18n } from "@comvi/vue";
import { handover, type Handover } from "@comvi/core/ssr";
import { config, options } from "#build/comvi.options";
import { resolveAcceptLanguage } from "#build/comvi.detection";
import { detectLocale } from "./utils/detect";
import { useLocaleCookie } from "./utils/cookie";
import { useHtmlAttrs } from "./utils/html-attrs";
import { track } from "./utils/instances";
import { splitPathAndSuffix } from "./utils/locale-path";

/**
 * The instance of the app: one per request on the server, one per page load in the
 * browser, created here before any component reads a translation.
 *
 * - Server: the locale is resolved from the request (URL, cookie, headers) BEFORE the
 *   instance exists, so it starts in it; the render waits for its startup catalogs here
 *   and for each `useI18n(ns)` in `onServerPrefetch` (`@comvi/vue`). `app:rendered`
 *   writes the one snapshot, `payload.comvi = handover(i18n)`. The request's end destroys
 *   the instance (the module's Nitro plugin).
 * - Browser: the instance starts from that snapshot, once per app life, so hydration
 *   asks the loader for nothing, a server `null` included. Nothing reads the payload again.
 */
export default defineNuxtPlugin({
  name: "@comvi/nuxt",
  enforce: "pre",

  async setup(nuxtApp) {
    const runtime = useRuntimeConfig();
    const routing = runtime.public.comvi;
    const cookie = useLocaleCookie();
    const payload = nuxtApp.payload.comvi as Handover | undefined;
    const event = import.meta.server ? nuxtApp.ssrContext?.event : undefined;

    let locale = payload?.locale;
    if (!locale) {
      // No snapshot: a server render, or a browser with no server render (`ssr: false`, an
      // SPA fallback page). The same resolver as the route middleware's.
      const base = runtime.app?.baseURL?.replace(/\/$/, "") ?? "";
      const raw = import.meta.server
        ? String(nuxtApp.ssrContext?.url ?? "/")
        : location.pathname + location.search;
      const { pathname, suffix } = splitPathAndSuffix(raw);
      const path =
        base && pathname.startsWith(base) ? pathname.slice(base.length) || "/" : pathname;
      const detected = detectLocale(
        routing,
        {
          pathname: path,
          query: Object.fromEntries(new URLSearchParams(suffix.split("#")[0])),
          cookie: cookie?.value,
          header: import.meta.server ? (name) => useRequestHeaders([name])[name] : undefined,
        },
        resolveAcceptLanguage,
      );
      locale = detected.locale;
      const value = detected.keep ?? locale;
      if (import.meta.server && cookie && cookie.value !== value) cookie.value = value;
    }

    const i18n = createI18n({ ...config, locale, ...options(event), ...payload });

    if (import.meta.server && event) {
      track(event, i18n);
      nuxtApp.hook("app:rendered", () => {
        nuxtApp.payload.comvi = handover(i18n);
      });
    }

    nuxtApp.vueApp.use(i18n);
    // The binding's own reactive slices of the instance (no hold outside a component).
    const { locale: current } = nuxtApp.vueApp.runWithContext(() => useI18n());

    // Registered before the first `await`, while the plugin still runs inside the Nuxt
    // app context `useHead` needs.
    if (routing.head !== false) useHtmlAttrs(current, routing.localeObjects);

    if (!import.meta.server && cookie) {
      // A locale change outside a navigation (`setLocale()`, a `v-model` on `locale`) is
      // recorded here; a navigation's own change is recorded by the route middleware,
      // which knows whether the cookie keeps a stored preference.
      let last = i18n.locale;
      i18n.on(() => {
        if (i18n.locale === last) return;
        last = i18n.locale;
        if (!(nuxtApp as unknown as { _comviNavigating?: number })._comviNavigating)
          cookie.value = last;
      });
    }

    await i18n.ready;

    return { provide: { i18n } };
  },
});

declare module "#app" {
  interface NuxtApp {
    /** The app's i18n instance (`@comvi/vue`'s); outside a component, it holds nothing. */
    $i18n: VueI18n;
  }
}
