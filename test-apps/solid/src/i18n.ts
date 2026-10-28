// Everything this app composes comes from ONE specifier. The exception is
// `@comvi/core/tags`: it registers tag syntax ambiently, so an app that wants
// tags in the plain `t()` string API names that side effect itself.
import "@comvi/core/tags";
import { createI18n, icuCompiler, loader } from "@comvi/solid";
import type { I18n, I18nLoaderApi, I18nPluginApi } from "@comvi/solid";
import { detect, persist } from "@comvi/core/plugins";

const supportedLocales = ["en", "de", "fr", "es", "uk", "ar"] as const;

// Annotated because the composed host is an intersection the compiler cannot
// name portably from this app's tsconfig (TS2883).
export const i18n: I18n & I18nLoaderApi & I18nPluginApi = createI18n({
  locale: "en",
  fallbackLocale: "en",
  // The 0.8 detector (lot 2c removed @comvi/plugin-locale-detector): the visitor's last
  // choice in localStorage, then the browser, written back on every switch.
  plugins: [
    detect({ supported: [...supportedLocales], order: ["storage", "navigator"] }),
    persist({ to: "storage" }),
  ],
  compiler: icuCompiler,
  tagInterpolation: {
    basicHtmlTags: ["strong", "em", "br", "a"],
  },
})
  // `loader(map)` attaches the capability and registers the import-map adapter
  // in one call; `registerLoader` on its own takes a plain `LoaderFn`.
  .use(
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
  );
