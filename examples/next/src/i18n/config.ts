import { createNextI18n, icuCompiler, loader } from "@comvi/next";
import { cdnLoader } from "@comvi/plugin-fetch-loader";
import { routing } from "./routing";

export { locales, routing } from "./routing";

// One dynamic `import()` per catalog, so a language is read the first time a
// request needs it. A key is `locale` for the default namespace or
// `locale:namespace` for another one.
const localCatalogs = {
  en: () => import("../locales/en.json"),
  uk: () => import("../locales/uk.json"),
  de: () => import("../locales/de.json"),
  ar: () => import("../locales/ar.json"),
  "en:account": () => import("../locales/account/en.json"),
  "uk:account": () => import("../locales/account/uk.json"),
  "de:account": () => import("../locales/account/de.json"),
  "ar:account": () => import("../locales/account/ar.json"),
};

// Connect your Comvi project: set `NEXT_PUBLIC_COMVI_CDN_URL` at build time and
// the catalogs come from the CDN, with the local files as the offline fallback.
const cdnUrl: string | undefined = process.env.NEXT_PUBLIC_COMVI_CDN_URL;
const catalogs = cdnUrl ? cdnLoader({ cdnUrl, fallback: localCatalogs }) : loader(localCatalogs);

// `withComvi({ config })` in next.config.ts points the server helpers and
// `<ComviProvider>` at this instance, on the server and in the browser.
export const { i18n } = createNextI18n({
  // The same URL rules the middleware enforces.
  ...routing,
  // A key missing in one language shows the English text instead of the key.
  fallbackLocale: "en",
  // ICU (`{count, plural, …}`) is opt-in, so apps without it ship less code.
  compiler: icuCompiler,
}).use(catalogs);

// `t()` never throws: a missing key is reported here, once per lookup. A real
// app would forward it to its error tracker; this one counts distinct misses.
export const missedKeys = new Set<string>();
i18n.on("missingKey", ({ key, locale, namespace }) => {
  missedKeys.add(`${locale}:${namespace}:${key}`);
});
