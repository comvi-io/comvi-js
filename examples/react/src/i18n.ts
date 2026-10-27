import { createI18n, type Loader } from "@comvi/react";
import { cdn } from "@comvi/core/cdn";
import { devtools } from "@comvi/core/devtools";
import { detect, persist } from "@comvi/core/plugins";

export const locales = ["en", "uk", "de", "ar"] as const;

// One dynamic import per catalog, so the bundler splits each into its own chunk
// and a language is downloaded only when someone picks it. `locale:namespace`
// keys belong to a namespace that a page loads when it needs it.
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

// Set VITE_COMVI_CDN_URL to serve translations from your Comvi project; the
// bundled catalogs stay as the fallback when the CDN cannot be reached.
const cdnUrl: string | undefined = import.meta.env.VITE_COMVI_CDN_URL;
const loader = cdnUrl ? cdn(cdnUrl, { fallback: bundled }) : fromBundle;

/** A tiny store for the demo's own counters, read with useSyncExternalStore. */
function store<T>(initial: T) {
  let value = initial;
  const listeners = new Set<() => void>();
  return {
    get: () => value,
    set(next: T) {
      value = next;
      listeners.forEach((listener) => listener());
    },
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
  };
}

/** The locales and namespaces whose catalogs have arrived so far. */
export const fetched = store({ locales: [] as string[], namespaces: [] as string[] });
const add = (list: string[], item: string) => (list.includes(item) ? list : [...list, item]);

/** Distinct keys reported missing. In your app, send them to an error tracker. */
export const missingKeys = store<ReadonlySet<string>>(new Set());

export const i18n = createI18n({
  locale: "en",
  // Any key a catalog lacks renders in English instead of as the key.
  fallbackLocale: "en",
  loader: async (locale, ns, signal) => {
    const catalog = await loader(locale, ns, signal);
    const { locales, namespaces } = fetched.get();
    fetched.set({ locales: add(locales, locale), namespaces: add(namespaces, ns) });
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
    queueMicrotask(() => {
      if (!missingKeys.get().has(id)) missingKeys.set(new Set(missingKeys.get()).add(id));
    });
  },
});
