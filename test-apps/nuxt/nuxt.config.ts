import tailwindcss from "@tailwindcss/vite";
import type { NuxtConfig } from "nuxt/schema";

type NuxtVitePlugin = NonNullable<NonNullable<NuxtConfig["vite"]>["plugins"]>[number];
const tailwindVitePlugin = tailwindcss() as unknown as NuxtVitePlugin;

export default defineNuxtConfig({
  modules: ["@comvi/nuxt"],
  srcDir: "app/",
  // Nuxt 3 looks for `server/` in `srcDir`; the source is shared with the Nuxt 4 app.
  serverDir: "server",
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
    // Explicit on purpose: the Nuxt 4 test app relies on the `./comvi.i18n.*` convention,
    // so this app keeps the `i18nModule` path exercised by a real build.
    i18nModule: "./comvi.i18n.ts",
  },

  devtools: { enabled: false },
  telemetry: false,

  // This app proves the Nuxt 3 end of @comvi/nuxt's peer range, so its types
  // must come from Nuxt 3. @nuxt/devtools-kit (shared by both Nuxt test apps,
  // no dependency on nuxt) imports `nuxt/app` and `nuxt/schema`, which resolve
  // to whichever Nuxt the workspace root hoists: Nuxt 4, packages/nuxt's
  // devDependency. Pin both to this app's own Nuxt. The `@nuxt/schema`
  // devDependency does the same for Nuxt's generated `@nuxt/schema` path.
  // Paths are relative to .nuxt/tsconfig.json.
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
