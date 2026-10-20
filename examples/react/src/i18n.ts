import { createI18n, devtools, icuCompiler, loader } from "@comvi/react";
import { cdnLoader } from "@comvi/plugin-fetch-loader";
import { localeDetector } from "@comvi/plugin-locale-detector";

export const locales = ["en", "uk", "de", "ar"] as const;

// One dynamic import per catalog, so the bundler splits each into its own chunk
// and a language is downloaded only when someone picks it. `locale:namespace`
// keys belong to a namespace that a page activates when it needs it.
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

// Set VITE_COMVI_CDN_URL to serve translations from your Comvi project; the
// bundled catalogs stay as the fallback when the CDN cannot be reached.
const cdnUrl: string | undefined = import.meta.env.VITE_COMVI_CDN_URL;
const catalogs: ReturnType<typeof loader> = cdnUrl
  ? cdnLoader({ cdnUrl, fallback: localCatalogs })
  : loader(localCatalogs);

// Which keys were missing. In your app, send them to an error tracker.
const missingKeys = new Set<string>();
const listeners = new Set<() => void>();
export const missingKeyCount = {
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
  get: () => missingKeys.size,
};

export const i18n = createI18n({
  locale: "en",
  // Any key a catalog lacks renders in English instead of as the key.
  fallbackLocale: "en",
  // ICU is opt-in: without it `{count, plural, …}` is plain text.
  compiler: icuCompiler,
  // t() never throws: a missing key is reported here, on every lookup. The
  // report arrives while a component renders, so the set updates after it.
  onMissingKey: ({ namespace, key }) =>
    queueMicrotask(() => {
      const id = `${namespace}:${key}`;
      if (missingKeys.has(id)) return;
      missingKeys.add(id);
      listeners.forEach((listener) => listener());
    }),
})
  .use(catalogs)
  .use(
    localeDetector({
      supportedLocales: [...locales],
      // `?lng=de` wins, then the visitor's last choice, then the browser.
      order: ["querystring", "localStorage", "navigator"],
      caches: ["localStorage"],
      fallbackLocale: "en",
    }),
  )
  // Makes the instance visible to the Comvi browser extension.
  .use(devtools());
