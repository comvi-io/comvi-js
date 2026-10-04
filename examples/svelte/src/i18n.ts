import { createI18n, icuCompiler, loader } from "@comvi/svelte";
import { cdnLoader } from "@comvi/plugin-fetch-loader";
import { localeDetector } from "@comvi/plugin-locale-detector";

export const locales = ["en", "uk", "de"] as const;

// Loadable but not in the switcher: the right-to-left locale the e2e suite uses
// to check `<html dir="rtl">`. Its catalog holds two keys; the rest falls back
// to English.
export const rtlLocale = "ar";

// Connect to Comvi, opt-in. With `VITE_COMVI_CDN_URL` set at BUILD time the
// catalogs come from the platform CDN through `cdnLoader`; unset — the default,
// and what StackBlitz runs — the import map below is the only loader and this
// file behaves exactly as it reads without these lines.
const cdnUrl: string | undefined = import.meta.env.VITE_COMVI_CDN_URL;

// The lazy loader. One dynamic `import()` per locale, so a catalog is fetched
// the first time that locale is selected and never up front — the bundler
// splits each JSON into its own chunk. `loader(map)` attaches the loader
// capability AND registers the import-map adapter; `registerLoader` on its
// own takes a plain function, never a map.
//
// One import map, two uses: the loader itself by default, and the CDN loader's
// `fallback` when the CDN is configured but unreachable. `ar` is not in the
// switcher; it is the right-to-left locale the e2e suite switches to.
const localCatalogs = {
  en: () => import("./locales/en.json"),
  uk: () => import("./locales/uk.json"),
  de: () => import("./locales/de.json"),
  ar: () => import("./locales/ar.json"),
};

const catalogs: ReturnType<typeof loader> = cdnUrl
  ? cdnLoader({ cdnUrl, fallback: localCatalogs })
  : loader(localCatalogs);

export const i18n = createI18n({
  locale: "en",
  fallbackLocale: "en",
  // ICU is never on by default. Without this line `{count, plural, …}` in the
  // catalog is not syntax: the simple compiler renders the braced segment
  // literally. It goes in the constructor options, which is before any catalog
  // can reach the host.
  compiler: icuCompiler,
})
  .use(catalogs)
  // The locale detector, through the package's own bare-name installer: it
  // attaches the plugin host it needs and registers the detector, so an app
  // never touches the raw plugin queue.
  .use(
    localeDetector({
      supportedLocales: [...locales],
      order: ["querystring", "localStorage", "navigator"],
      caches: ["localStorage"],
      fallbackLocale: "en",
    }),
  );
