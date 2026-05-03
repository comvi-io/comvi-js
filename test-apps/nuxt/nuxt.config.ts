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
    fallbackLanguage: "en",
    detectBrowserLanguage: {
      useCookie: true,
      cookieName: "i18n_locale",
      redirectOnFirstVisit: true,
    },
    basicHtmlTags: ["strong", "em", "a", "br"],
  },

  devtools: { enabled: true },

  compatibilityDate: "2025-01-01",
});
