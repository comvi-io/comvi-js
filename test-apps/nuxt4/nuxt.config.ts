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
    // No `i18nModule`: `app/comvi.i18n.ts` is picked up by convention (srcDir,
    // then rootDir) and the module logs the path it resolved at build time.
    // The nuxt 3 test app names it explicitly, so both paths stay exercised.
    // Its host file keeps the `satisfies NuxtInstanceFactory` form; the nuxt 3 test
    // app uses `defineComviI18n`, so both typings stay exercised too.
    fallbackLocale: "en",
    localeCookie: "i18n_locale",
    basicHtmlTags: ["strong", "em", "a", "br"],
  },

  devtools: { enabled: true },

  // Types from this app's own Nuxt 4: @nuxt/devtools-kit (shared with the
  // Nuxt 3 test app, no dependency on nuxt) imports `nuxt/app` and
  // `nuxt/schema`, which otherwise resolve to whichever Nuxt pnpm placed next
  // to it. Paths are relative to .nuxt/tsconfig.json.
  typescript: {
    tsConfig: {
      compilerOptions: {
        paths: {
          "nuxt/app": ["../node_modules/nuxt/app"],
          "nuxt/schema": ["../node_modules/nuxt/schema"],
        },
      },
    },
  },

  compatibilityDate: "2024-11-01",
});
