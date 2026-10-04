import { createNextI18n, icuCompiler, loader } from "@comvi/next";
import { routing as routingRules } from "./routing";

/**
 * Creates both the i18n instance and the routing config in one call, then
 * composes the import-map loader through the one composition verb. ICU is
 * never a default anywhere, so `compiler: icuCompiler` is named for the plurals
 * in these catalogs; a runtime-scoped plugin would go through
 * `nextPlugin(...)` from the same specifier.
 */
export const { i18n, routing } = createNextI18n({
  ...routingRules,
  compiler: icuCompiler,
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
