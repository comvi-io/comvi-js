import { defineNuxtConfig } from "nuxt/config";

export default defineNuxtConfig({
  modules: ["@comvi/nuxt"],
  srcDir: "src/",
  compatibilityDate: "2024-11-01",

  runtimeConfig: {
    public: {
      // Empty: the app uses the bundled catalogs. NUXT_PUBLIC_COMVI_CDN_URL
      // fills it at runtime, and `src/comvi.i18n.ts` switches to the CDN.
      comviCdnUrl: "",
    },
  },

  comvi: {
    defaultLocale: "en",
    // No `dir` needed: the module derives it from the code, so `ar` gets
    // <html dir="rtl"> on its own.
    locales: [
      { code: "en", name: "English" },
      { code: "uk", name: "Українська" },
      { code: "de", name: "Deutsch" },
      { code: "ar", name: "العربية" },
    ],
    // Every URL carries its locale (/en, /uk/about), so each language is a
    // real, shareable, crawlable address.
    localePrefix: "always",
    // A key missing in one language shows the English text, never the key.
    fallbackLocale: "en",
  },
});
