import { defineRouting } from "@comvi/next/routing";

/** The locales the switcher shows. Arabic is right-to-left. */
export const locales = ["en", "uk", "de", "ar"] as const;

// The URL rules only, in a file of their own: `middleware.ts` runs on the Edge
// and imports this, so it does not pull the i18n instance into middleware.
export const routing = defineRouting({
  locales: [...locales],
  // Every URL carries its locale, so /en, /uk and /de are real addresses to
  // link, bookmark and cache.
  localePrefix: "always",
  defaultLocale: "en",
});

/** What the server and the browser instances must agree on: plain data, imported by both. */
export const options = {
  // A key missing in one language shows the English text instead of the key.
  fallbackLocale: "en",
};
