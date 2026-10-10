// Turns on `<tag>…</tag>` in every `t()` and `tRaw()` call. Framework apps skip
// it: their `<T>` passes the tag grammar per call.
import "@comvi/core/tags";
import { createI18n } from "@comvi/core";
import { icuCompiler } from "@comvi/core/icu";
import { loader } from "@comvi/core/loader";
import { cdnLoader } from "@comvi/plugin-fetch-loader";
import { localeDetector } from "@comvi/plugin-locale-detector";

export const locales = ["en", "uk", "de", "ar"] as const;

// One dynamic `import()` per catalog, so the bundler splits each into its own
// chunk and a language is downloaded the first time someone picks it. A key is
// `locale` for the default namespace or `locale:namespace` for another one.
const localCatalogs = {
  en: () => import("./locales/en.json"),
  uk: () => import("./locales/uk.json"),
  de: () => import("./locales/de.json"),
  ar: () => import("./locales/ar.json"),
  "en:account": () => import("./locales/account/en.json"),
  "uk:account": () => import("./locales/account/uk.json"),
  "de:account": () => import("./locales/account/de.json"),
  "ar:account": () => import("./locales/account/ar.json"),
};

// Connect your Comvi project: set `VITE_COMVI_CDN_URL` at build time and the
// catalogs come from the CDN, with the local files as the offline fallback.
const cdnUrl: string | undefined = import.meta.env.VITE_COMVI_CDN_URL;
const catalogs = cdnUrl ? cdnLoader({ cdnUrl, fallback: localCatalogs }) : loader(localCatalogs);

// `t()` never throws: a missing key is reported to `onMissingKey`. A real app
// would forward it to its error tracker; this one keeps the distinct keys.
export const missedKeys = new Set<string>();

export const i18n = createI18n({
  locale: "en",
  // A key missing in one language shows the English text instead of the key.
  fallbackLocale: "en",
  // ICU (`{count, plural, …}`) is opt-in, so apps without it ship less code.
  compiler: icuCompiler,
  onMissingKey: ({ key, namespace }) => {
    missedKeys.add(`${namespace}:${key}`);
  },
})
  .use(catalogs)
  .use(
    localeDetector({
      supportedLocales: [...locales],
      // A `?lng=` link wins, then the last choice, then the browser's language.
      order: ["querystring", "localStorage", "navigator"],
      // Remember the choice for the next visit.
      caches: ["localStorage"],
      fallbackLocale: "en",
    }),
  );
