import { defineRouting } from "@comvi/next/routing";

/**
 * Plain data shared by the middleware (Edge), the server helper and the browser: the URL rules
 * and the options both instances must agree on. No loader, nothing that needs a runtime.
 */
export const routing = defineRouting({
  locales: ["en", "de", "fr", "es", "uk", "ar"],
  defaultLocale: "en",
  localePrefix: "as-needed",
});

export const options = { fallbackLocale: "en" };
