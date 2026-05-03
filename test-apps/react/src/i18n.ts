import { createI18n } from "@comvi/react";
import { LocaleDetector } from "@comvi/plugin-locale-detector";

const supportedLocales = ["en", "de", "fr", "es", "uk", "ar"] as const;

export const i18n = createI18n({
  locale: "en",
  fallbackLocale: "en",
  tagInterpolation: {
    basicHtmlTags: ["strong", "em", "br", "a"],
  },
}).use(
  LocaleDetector({
    supportedLocales: [...supportedLocales],
    order: ["localStorage", "navigator"],
    caches: ["localStorage"],
  }),
);

i18n.registerLoader({
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
