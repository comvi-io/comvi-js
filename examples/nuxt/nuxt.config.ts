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

  comvi: {
    defaultLocale: "en",
    // No `dir` on any of them: `useLocaleHead({ addDir: true })` derives the
    // direction from the locale itself, so <html dir="ltr"> is written here and
    // an Arabic locale added to this list would get "rtl" with no further
    // change. Declaring `dir` is for overriding that, not for enabling it.
    locales: [
      { code: "en", name: "English" },
      { code: "uk", name: "Українська" },
      { code: "de", name: "Deutsch" },
    ],
    // `always`: every URL carries its locale, so /en, /uk and /de are three real
    // addresses. The module clones `src/pages` into locale-prefixed routes and
    // its route middleware pre-loads the catalog before the page renders.
    localePrefix: "always",
    fallbackLocale: "en",
    // The one option that decides what the host CAN do. Without it the module
    // generates the base host — no ICU, no loader — and this demo has both.
    hostModule: "./comvi.host.ts",
  },
});
