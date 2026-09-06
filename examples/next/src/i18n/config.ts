import { createNextI18n } from "@comvi/next";

export const locales = ["en", "uk", "de"] as const;

/**
 * The composed root. `createNextI18n` is the batteries-included preset: it
 * composes ICU, the tag grammar, the loader and the plugin host INSIDE the
 * package, which is why this file names no installer. The other five examples
 * name each one by hand because their host is core's bare base host — the
 * difference is the preset, not the framework.
 *
 * It returns the host AND the routing config from one call, so the URL rules
 * and the runtime cannot drift apart.
 */
export const nextI18n = createNextI18n({
  locales: [...locales],
  defaultLocale: "en",
  // `always`: every URL carries its locale, so /en, /uk and /de are three real
  // addresses you can link, bookmark and curl. `as-needed` (the default) would
  // serve the default locale from an unprefixed /.
  localePrefix: "always",
  fallbackLocale: "en",
});

// The lazy loader. One dynamic `import()` per locale, so a catalog is read the
// first time that locale is requested and never up front. `registerLoader` on a
// COMPOSED host keeps the import-map overload; on a host you build yourself it
// takes a plain `LoaderFn` and the map form is `loader(map)`.
nextI18n.i18n.registerLoader({
  en: () => import("../locales/en.json"),
  uk: () => import("../locales/uk.json"),
  de: () => import("../locales/de.json"),
});

export const { i18n, routing } = nextI18n;
