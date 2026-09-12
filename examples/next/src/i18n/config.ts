import { createNextI18n, loader } from "@comvi/next";
import { routing } from "./routing";

export { locales, routing } from "./routing";

/**
 * The composed root. `createNextI18n` is the batteries-included preset: it
 * composes ICU (the `compiler` option, `icuCompiler` by default), the tag
 * grammar, the loader and the plugin host INSIDE the package. The other five
 * examples name each capability by hand because their host is core's bare base
 * host — the difference is the preset, not the framework.
 *
 * The URL rules come from `./routing` and are spread straight in, so the
 * middleware and the runtime cannot drift apart while `middleware.ts` keeps
 * importing the core-free file (see the comment there).
 *
 * `.use(installer)` is the one composition verb, here as on every host.
 * `loader(map)` registers one dynamic `import()` per locale, so a catalog is
 * read the first time that locale is requested and never up front. A plugin
 * scoped to one runtime goes through `nextPlugin(...)` / `nextPluginLazy(...)`
 * from the same specifier — never `localeDetector()`: this host is process-wide
 * on the App Router, and the first request's headers would pin the locale for
 * every later render.
 */
export const { i18n } = createNextI18n({
  ...routing,
  fallbackLocale: "en",
}).use(
  loader({
    en: () => import("../locales/en.json"),
    uk: () => import("../locales/uk.json"),
    de: () => import("../locales/de.json"),
  }),
);
