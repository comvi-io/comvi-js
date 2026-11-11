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

  // The catalog source and its credential: private, server only (`NUXT_COMVI_SOURCE`
  // points it at the e2e's catalog mock). The e2e checks neither reaches the client build.
  runtimeConfig: {
    comviSource: "http://127.0.0.1:45811",
    comviToken: "comvi-e2e-server-secret-5d1c9f",
  },

  comvi: {
    locales: [
      { code: "en", name: "English", iso: "en-US" },
      { code: "de", name: "Deutsch", iso: "de-DE" },
      { code: "de-AT", name: "Deutsch (Österreich)", iso: "de-AT" },
      { code: "fr", name: "Francais", iso: "fr-FR" },
      { code: "es", name: "Espanol", iso: "es-ES" },
      { code: "uk", name: "Ukrainska", iso: "uk-UA" },
      { code: "ar", name: "Arabic", iso: "ar-SA", dir: "rtl" },
    ],
    defaultLocale: "en",
    localePrefix: "as-needed",
    fallbackLocale: "en",
    // The server's zone; the e2e's browser runs in UTC.
    timeZone: "Pacific/Kiritimati",
    // No `i18nModule`: `app/comvi.i18n.ts` is picked up by convention (srcDir, then
    // rootDir). The Nuxt 3 test app names it explicitly, so both paths stay exercised.
  },

  devtools: { enabled: false },
  telemetry: false,

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
