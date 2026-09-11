// `@comvi/core/tags` is the one side-effectful subpath: importing it registers
// tag syntax AMBIENTLY, so plain `t()` / `tRaw()` calls parse `<tag>…</tag>`.
// Framework apps do not need it — their `<T>` passes the grammar per call —
// but an app that renders rich text through the string API names the side
// effect itself, right here.
import "@comvi/core/tags";
import { createI18n } from "@comvi/core";
import { icuCompiler } from "@comvi/core/icu";
import { loader } from "@comvi/core/loader";
import { localeDetector } from "@comvi/plugin-locale-detector";

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
  .use(
    loader({
      en: () => import("./locales/en.json"),
      uk: () => import("./locales/uk.json"),
      de: () => import("./locales/de.json"),
    }),
  )
  // The locale detector, through the package's own lowercase installer: it
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
