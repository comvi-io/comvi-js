export default defineNuxtConfig({
  compatibilityDate: "2025-07-15",
  devtools: { enabled: false },
  modules: ["@comvi/nuxt"],
  comvi: {
    defaultLocale: "en",
    locales: ["en"],
    messages: {
      en: { greeting: "Hello, {name}!" },
    },
  },
});
