export default defineNuxtConfig({
  compatibilityDate: "2025-07-15",
  devtools: { enabled: false },
  modules: ["@nuxtjs/i18n"],
  i18n: {
    locales: [{ code: "en", file: "en.json" }],
    defaultLocale: "en",
    strategy: "no_prefix",
    lazy: false,
    vueI18n: "./i18n.config.ts",
  },
});
