import { createSignal } from "solid-js";
import { createI18n, type Loader } from "@comvi/solid";
import { cdn } from "@comvi/core/cdn";
import { devtools } from "@comvi/core/devtools";
import { detect, persist } from "@comvi/core/plugins";

export const locales = ["en", "uk", "de", "ar"] as const;
export type Locale = (typeof locales)[number];

// One dynamic import per catalog, so the bundler gives each its own chunk and
// a language is downloaded only when someone picks it. `locale:account` is a
// second namespace that only the Account page asks for.
const bundled = {
  en: () => import("./locales/en.json"),
  uk: () => import("./locales/uk.json"),
  de: () => import("./locales/de.json"),
  ar: () => import("./locales/ar.json"),
  "en:account": () => import("./locales/account/en.json"),
  "uk:account": () => import("./locales/account/uk.json"),
  "de:account": () => import("./locales/account/de.json"),
  "ar:account": () => import("./locales/account/ar.json"),
};

// A loader is a function: (locale, namespace, signal) → catalog.
const fromBundle: Loader = async (locale, ns) => {
  const load = bundled[(ns === "default" ? locale : `${locale}:${ns}`) as keyof typeof bundled];
  if (!load) throw new Error(`No bundled catalog for ${locale}/${ns}`);
  return (await load()).default;
};

// Set VITE_COMVI_CDN_URL to serve the catalogs from your Comvi project. The
// local files stay as the fallback for when the CDN cannot be reached.
const cdnUrl: string | undefined = import.meta.env.VITE_COMVI_CDN_URL;
const loader = cdnUrl ? cdn(cdnUrl, { fallback: bundled }) : fromBundle;

/** The locales and namespaces whose catalogs have arrived so far. */
const [fetched, setFetched] = createSignal({ locales: [] as string[], namespaces: [] as string[] });
export { fetched };
const add = (list: string[], item: string) => (list.includes(item) ? list : [...list, item]);

// The keys no catalog has. In your app, send each one to an error tracker.
const missed = new Set<string>();
const [missingKeys, setMissingKeys] = createSignal(0);
export { missingKeys };

export const i18n = createI18n({
  locale: "en",
  // A key a catalog lacks is looked up in English before it shows as a key.
  fallbackLocale: "en",
  loader: async (locale, ns, signal) => {
    const catalog = await loader(locale, ns, signal);
    const { locales, namespaces } = fetched();
    setFetched({ locales: add(locales, locale), namespaces: add(namespaces, ns) });
    return catalog;
  },
  plugins: [
    // `?lang=de` wins, then the visitor's last choice (a cookie), then the browser.
    detect({ supported: [...locales] }),
    // Remembers every switch in that cookie.
    persist(),
    // Makes the instance visible to the Comvi browser extension.
    devtools(),
  ],
  // t() never throws: every problem is reported here. A missing key is reported
  // while a component renders, so the counter updates after that render.
  onError(error) {
    if (error.code !== "missing_key") return;
    const id = `${error.ns}:${error.key}`;
    if (missed.has(id)) return;
    missed.add(id);
    queueMicrotask(() => setMissingKeys(missed.size));
  },
});
