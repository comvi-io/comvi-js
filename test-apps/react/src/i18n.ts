// The converged single entry: `@comvi/react`'s `createI18n` builds the base
// host, and every capability this app uses is composed on explicitly — the
// plugin host for the locale detector, the loader for the import map, ambient
// tags for the `basicHtmlTags` markup, and ICU for the plural catalogs.
import "@comvi/core/tags";
import { createI18n } from "@comvi/react";
import { icuCompiler } from "@comvi/core/icu";
import { loader } from "@comvi/core/loader";
import { plugins } from "@comvi/core/plugins";
import { LocaleDetector } from "@comvi/plugin-locale-detector";

const supportedLocales = ["en", "de", "fr", "es", "uk", "ar"] as const;

export const i18n = createI18n({
  locale: "en",
  fallbackLocale: "en",
  compiler: icuCompiler,
  tagInterpolation: {
    basicHtmlTags: ["strong", "em", "br", "a"],
  },
})
  // The import map goes through the CONFIGURED installer: the loader
  // capability's own `registerLoader` takes a `LoaderFn`, and `loader(map)`
  // attaches + registers the import-map adapter in one call.
  .with(
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
  )
  .with(plugins())
  .use(
    LocaleDetector({
      supportedLocales: [...supportedLocales],
      order: ["localStorage", "navigator"],
      caches: ["localStorage"],
    }),
  );
