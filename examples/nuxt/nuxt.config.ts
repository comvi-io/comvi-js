import { defineNuxtConfig } from "nuxt/config";
// The type-only import is what pulls in the module's `NuxtConfig` augmentation,
// so the `comvi` key below is type-checked. Nuxt's own generated types do this
// for you once `nuxt dev` (or `nuxt prepare`) has run at least once.
import type {} from "@comvi/nuxt";

export default defineNuxtConfig({
  modules: ["@comvi/nuxt"],
  // The catalogs are shared across every example and copied into
  // `<example>/src/locales`, so this app's source root is `src/` too.
  srcDir: "src/",
  compatibilityDate: "2024-11-01",

  // Connect to Comvi, opt-in: empty by default, so `comvi.host.ts` composes the
  // local import map. `NUXT_PUBLIC_COMVI_CDN_URL` overrides it at runtime (Nuxt
  // maps that variable onto this key), and the host then loads every catalog
  // from the platform CDN instead, on the server and in the browser.
  runtimeConfig: {
    public: {
      comviCdnUrl: "",
    },
  },

  comvi: {
    defaultLocale: "en",
    // No `dir` on any of them: the module derives the direction from the
    // locale itself, so <html dir="ltr"> is written here and
    // an Arabic locale added to this list would get "rtl" with no further
    // change. Declaring `dir` is for overriding that, not for enabling it.
    locales: [
      { code: "en", name: "English" },
      { code: "uk", name: "Українська" },
      { code: "de", name: "Deutsch" },
      // Not in the switcher (pages/index.vue filters it out): the right-to-left
      // locale the e2e suite uses to check `<html dir="rtl">`.
      { code: "ar", name: "العربية" },
    ],
    // `always`: every URL carries its locale, so /en, /uk and /de are three real
    // addresses. The module clones `src/pages` into locale-prefixed routes and
    // its route middleware pre-loads the catalog before the page renders.
    localePrefix: "always",
    fallbackLocale: "en",
    // The file that decides what the host CAN do. `./comvi.host.*` under
    // srcDir is picked up by convention (the module logs the path it chose),
    // so this line is the explicit form of the default; without the file the
    // module generates the base host — no ICU, no loader — and this demo has
    // both.
    hostModule: "./comvi.host.ts",
  },
});
