import { createNextI18n } from "@comvi/next";

/**
 * Central i18n configuration using createNextI18n factory.
 *
 * This creates both the i18n instance and routing config in one call.
 */
export const nextI18n = createNextI18n({
  // Routing
  locales: ["en", "de", "fr", "es", "uk", "ar"],
  defaultLocale: "en",
  localePrefix: "as-needed",

  // i18n options
  fallbackLocale: "en",
  defaultNs: "default",
  basicHtmlTags: ["strong", "em", "br", "a"],
});

nextI18n.i18n.registerLoader({
  en: () => import("./locales/en.json"),
  de: () => import("./locales/de.json"),
  fr: () => import("./locales/fr.json"),
  es: () => import("./locales/es.json"),
  uk: () => import("./locales/uk.json"),
  ar: () => import("./locales/ar.json"),
  "en:admin": () => import("./locales/admin/en.json"),
  "de:admin": () => import("./locales/admin/de.json"),
  "fr:admin": () => import("./locales/admin/fr.json"),
  "es:admin": () => import("./locales/admin/es.json"),
  "uk:admin": () => import("./locales/admin/uk.json"),
  "ar:admin": () => import("./locales/admin/ar.json"),
});

export const { i18n, routing } = nextI18n;
