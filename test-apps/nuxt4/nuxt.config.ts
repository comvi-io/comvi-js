import tailwindcss from "@tailwindcss/vite";
import type { NuxtConfig } from "nuxt/schema";

type NuxtVitePlugin = NonNullable<NonNullable<NuxtConfig["vite"]>["plugins"]>[number];
const tailwindVitePlugin = tailwindcss() as unknown as NuxtVitePlugin;

export default defineNuxtConfig({
  modules: ["@comvi/nuxt"],
  css: ["~/assets/css/main.css"],
  sourcemap: false,
  vite: {
    plugins: [tailwindVitePlugin],
  },

  comvi: {
    locales: [
      { code: "en", name: "English", iso: "en-US" },
      { code: "de", name: "Deutsch", iso: "de-DE" },
      { code: "fr", name: "Francais", iso: "fr-FR" },
      { code: "es", name: "Espanol", iso: "es-ES" },
      { code: "uk", name: "Ukrainska", iso: "uk-UA" },
      { code: "ar", name: "Arabic", iso: "ar-SA", dir: "rtl" },
    ],
    defaultLocale: "en",
    localePrefix: "as-needed",
    defaultNs: "default",
    // No `hostModule`: `app/comvi.host.ts` is picked up by convention (srcDir,
    // then rootDir) and the module logs the path it resolved at build time.
    // The nuxt 3 test app names it explicitly, so both paths stay exercised.
    // Its host file keeps the `satisfies NuxtInstanceFactory` form; the nuxt 3 test
    // app uses `defineComviHost`, so both typings stay exercised too.
    fallbackLocale: "en",
    localeCookie: "i18n_locale",
    basicHtmlTags: ["strong", "em", "a", "br"],
  },

  devtools: { enabled: true },

  compatibilityDate: "2024-11-01",
});
