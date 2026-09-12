import { createNextI18n, loader } from "@comvi/next";

/**
 * Creates both the i18n instance and the routing config in one call, then
 * composes the import-map loader through the one composition verb. ICU is the
 * factory's default `compiler`; a runtime-scoped plugin would go through
 * `nextPlugin(...)` from the same specifier.
 */
export const { i18n, routing } = createNextI18n({
  locales: ["en", "de", "fr", "es", "uk", "ar"],
  defaultLocale: "en",
  localePrefix: "as-needed",

  fallbackLocale: "en",
  defaultNs: "default",
  basicHtmlTags: ["strong", "em", "br", "a"],
}).use(
  loader({
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
  }),
);
