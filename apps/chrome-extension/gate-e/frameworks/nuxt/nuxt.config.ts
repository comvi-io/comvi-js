// The Nuxt row of Gate E: served under /nuxt/ through the mock server (one page origin).
export default defineNuxtConfig({
  modules: ["@comvi/nuxt"],
  app: { baseURL: "/nuxt/" },
  comvi: {
    locales: ["en", "de"],
    defaultLocale: "en",
    localePrefix: "as-needed",
    fallbackLocale: "en",
    namespaces: ["default", "common"],
    timeZone: "UTC",
  },
  devtools: { enabled: false },
  telemetry: false,
  sourcemap: false,
  compatibilityDate: "2024-11-01",
});
