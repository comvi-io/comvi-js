import { createI18n, icuCompiler, loader, plugins } from "@comvi/solid";
import { LocaleDetector } from "@comvi/plugin-locale-detector";

export const locales = ["en", "uk", "de"] as const;

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
  .with(
    loader({
      en: () => import("./locales/en.json"),
      uk: () => import("./locales/uk.json"),
      de: () => import("./locales/de.json"),
    }),
  )
  // The plugin host. `.use()` lives on this capability, not on the base host.
  .with(plugins())
  .use(
    LocaleDetector({
      supportedLocales: [...locales],
      order: ["querystring", "localStorage", "navigator"],
      caches: ["localStorage"],
      fallbackLocale: "en",
    }),
  );
