import { createSignal } from "solid-js";
import { createI18n, devtools, icuCompiler, loader } from "@comvi/solid";
import { cdn } from "@comvi/core/cdn";
import { detect, persist } from "@comvi/core/plugins";

export const locales = ["en", "uk", "de", "ar"] as const;
export type Locale = (typeof locales)[number];

// One dynamic import per catalog, so the bundler gives each its own chunk and
// a language is downloaded only when someone picks it. `locale:account` is a
// second namespace that only the Account page asks for.
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

// Set VITE_COMVI_CDN_URL to serve the catalogs from your Comvi project. The
// local files stay as the fallback for when the CDN cannot be reached.
const cdnUrl: string | undefined = import.meta.env.VITE_COMVI_CDN_URL;
const catalogs = cdnUrl ? cdn(cdnUrl, { fallback: localCatalogs }) : loader(localCatalogs);

// The keys no catalog has. In your app, send each one to an error tracker.
const missed = new Set<string>();
const [missingKeys, setMissingKeys] = createSignal(0);
export { missingKeys };

export const i18n = createI18n({
  locale: "en",
  // A key a catalog lacks is looked up in English before it shows as a key.
  fallbackLocale: "en",
  // A shared link (`?lang=de`) wins, then the visitor's last choice, then the browser.
  plugins: [
    detect({ supported: [...locales], order: ["query", "storage", "navigator"] }),
    persist({ to: "storage" }),
  ],
  // ICU plural, select and selectordinal are opt-in, so apps without them ship less.
  compiler: icuCompiler,
  // t() never throws: a missing key is reported here, on every render that
  // reads it, so the set keeps each key once. The report arrives while a
  // component renders, so the counter updates after the render has finished.
  onMissingKey: ({ key, namespace }) => {
    const id = `${namespace}:${key}`;
    if (missed.has(id)) return;
    missed.add(id);
    queueMicrotask(() => setMissingKeys(missed.size));
  },
})
  .use(catalogs)
  // Makes the instance visible to the Comvi browser extension.
  .use(devtools());
