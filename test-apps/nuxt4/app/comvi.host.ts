import { createI18n, icuCompiler, loader, type NuxtInstanceFactory } from "@comvi/nuxt/host";

// The generated Nuxt default is deliberately the base host; this app renders ICU
// catalogs and loads them on the server, so it composes both explicitly. This is
// the one file in the app that names comvi values, and they all come from
// `@comvi/nuxt/host`, which re-exports core's installers — so the file needs no
// dependency the app did not install. `loader(map)` attaches the loader
// capability AND registers the map; the catalogs live in `../../locales`,
// shared by every test app.
export default ((options) =>
  createI18n({ ...options, compiler: icuCompiler }).use(
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
  )) satisfies NuxtInstanceFactory;
