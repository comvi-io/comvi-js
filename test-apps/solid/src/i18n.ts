// The converged single entry: everything this app composes — the base host,
// the ICU compiler for the plural catalogs, the loader for the import map and
// the plugin host for the locale detector — comes from `@comvi/solid`.
//
// The ONE exception is `@comvi/core/tags`: importing it registers tag syntax
// ambiently, so the wrapper deliberately does not re-export it and an app that
// wants tags in the plain `t()` string API names the side effect itself.
import "@comvi/core/tags";
import { createI18n, icuCompiler, loader, plugins } from "@comvi/solid";
import type { I18n, I18nLoaderApi, I18nPluginHostApi } from "@comvi/solid";
import { LocaleDetector } from "@comvi/plugin-locale-detector";

const supportedLocales = ["en", "de", "fr", "es", "uk", "ar"] as const;

// Annotated because the composed host is an intersection the compiler cannot
// name portably from this app's tsconfig (TS2883).
export const i18n: I18n & I18nLoaderApi & I18nPluginHostApi = createI18n({
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
      en: () => import("../../locales/en.json"),
      de: () => import("../../locales/de.json"),
      fr: () => import("../../locales/fr.json"),
      es: () => import("../../locales/es.json"),
      uk: () => import("../../locales/uk.json"),
      ar: () => import("../../locales/ar.json"),
      "en:admin": () => import("../../locales/admin/en.json"),
      "de:admin": () => import("../../locales/admin/de.json"),
      "fr:admin": () => import("../../locales/admin/fr.json"),
      "es:admin": () => import("../../locales/admin/es.json"),
      "uk:admin": () => import("../../locales/admin/uk.json"),
      "ar:admin": () => import("../../locales/admin/ar.json"),
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
