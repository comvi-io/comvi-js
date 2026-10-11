export default defineNuxtConfig({
  compatibilityDate: "2025-07-15",
  devtools: { enabled: false },
  modules: ["@comvi/nuxt"],
  comvi: {
    icu: true,
    defaultLocale: "en",
    locales: ["en"],
    messages: {
      en: { greeting: "{count, plural, one {# item} other {# items}} for {name}" },
    },
  },
});
