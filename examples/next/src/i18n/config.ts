import { createNextI18n, icuCompiler, loader } from "@comvi/next";
import { cdnLoader } from "@comvi/plugin-fetch-loader/cdn";
import { routing } from "./routing";

export { locales, routing, rtlLocale } from "./routing";

// Connect to Comvi, opt-in. With `NEXT_PUBLIC_COMVI_CDN_URL` set at BUILD time
// the catalogs come from the platform CDN through `cdnLoader`, on the server and
// in the browser alike; unset — the default, and what StackBlitz runs — the
// import map is the only loader and this file behaves exactly as it reads
// without these lines.
const cdnUrl: string | undefined = process.env.NEXT_PUBLIC_COMVI_CDN_URL;

// One import map, two uses: the loader itself by default, and the CDN loader's
// `fallback` when the CDN is configured but unreachable. `ar` is not in the
// switcher; it is the right-to-left locale the e2e suite switches to.
const localCatalogs = {
  en: () => import("../locales/en.json"),
  uk: () => import("../locales/uk.json"),
  de: () => import("../locales/de.json"),
  ar: () => import("../locales/ar.json"),
};

const catalogs: ReturnType<typeof loader> = cdnUrl
  ? cdnLoader({ cdnUrl, fallback: localCatalogs })
  : loader(localCatalogs);

/**
 * The composed root. `createNextI18n` is the batteries-included preset: it
 * composes the tag grammar, the loader and the plugin host INSIDE the package.
 * The other five examples name each capability by hand because their host is
 * core's bare base host — the difference is the preset, not the framework.
 *
 * The compiler is NOT part of the preset. No constructor in the repo turns ICU
 * on by itself, so the plural in `locales/*.json` needs `compiler: icuCompiler`
 * named here, exactly as the other five examples name it.
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
  compiler: icuCompiler,
}).use(catalogs);
