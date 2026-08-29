// Everything this app composes comes from ONE specifier. The exception is
// `@comvi/core/tags`: it registers tag syntax ambiently, so an app that wants
// tags in the plain `t()` string API names that side effect itself.
import "@comvi/core/tags";
import { createI18n, icuCompiler, loader, plugins } from "@comvi/react";
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
  // `loader(map)` attaches the capability and registers the import-map adapter
  // in one call; `registerLoader` on its own takes a plain `LoaderFn`.
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
