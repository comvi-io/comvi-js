import { createI18n, icuCompiler, loader } from "@comvi/vue";
import { localeDetector } from "@comvi/plugin-locale-detector";

export const locales = ["en", "uk", "de"] as const;

// One call builds the base host, and each `.use(…)` composes a capability on
// it. The result is the same `VueI18n` instance throughout; `.use` only
// widens the type of `i18n.core` by what it just composed.
export const i18n = createI18n({
  locale: "en",
  fallbackLocale: "en",
  // ICU is never on by default. Without this line `{count, plural, …}` in the
  // catalog is not syntax: the simple compiler renders the braced segment
  // literally. It goes in the constructor options, which is before any catalog
  // can reach the host.
  compiler: icuCompiler,
})
  // The lazy loader. One dynamic `import()` per locale, so a catalog is fetched
  // the first time that locale is selected and never up front — the bundler
  // splits each JSON into its own chunk. `loader(map)` attaches the loader
  // capability AND registers the import-map adapter; `registerLoader` on its
  // own takes a plain function, never a map.
  .use(
    loader({
      en: () => import("./locales/en.json"),
      uk: () => import("./locales/uk.json"),
      de: () => import("./locales/de.json"),
    }),
  )
  // The locale detector, through the package's own lowercase installer: it
  // attaches the plugin host it needs and registers the detector, so an app
  // never touches the raw plugin queue. Composed on the WRAPPER, before
  // `app.use(i18n)` — vue's own `use`, which starts init().
  .use(
    localeDetector({
      supportedLocales: [...locales],
      order: ["querystring", "localStorage", "navigator"],
      caches: ["localStorage"],
      fallbackLocale: "en",
    }),
  );
