import { useCookie, useNuxtApp, useRuntimeConfig } from "#app";
import type { Ref } from "vue";

const KEY = "_comviLocaleCookie";

/**
 * The locale cookie: ONE ref per app (per request on the server), created by the plugin
 * and read and written through it only — by the server's resolution, the route
 * middleware, a locale change of the instance and `<NuxtLinkLocale locale>`. `null` with
 * `localeCookie: false`. One ref, so Nuxt writes the response's `Set-Cookie` once and
 * every reader in the browser sees a write at once.
 */
export function useLocaleCookie(): Ref<string | null | undefined> | null {
  const nuxtApp = useNuxtApp() as unknown as Record<string, Ref<string | null | undefined> | null>;
  if (KEY in nuxtApp) return nuxtApp[KEY]!;
  const config = useRuntimeConfig().public.comvi.localeCookie;
  return (nuxtApp[KEY] = config
    ? useCookie<string>(config.name, {
        maxAge: config.maxAge,
        path: "/",
        sameSite: config.sameSite,
        domain: config.domain,
        // Secure in production, off in development so localhost HTTP works.
        secure: import.meta.dev ? false : config.secure,
      })
    : null);
}
