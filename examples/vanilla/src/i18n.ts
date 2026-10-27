import { createI18n, type Loader } from "@comvi/core";
import { cdn } from "@comvi/core/cdn";
import { devtools } from "@comvi/core/devtools";
import { detect, persist } from "@comvi/core/plugins";

export const locales = ["en", "uk", "de", "ar"] as const;

// One dynamic `import()` per catalog, so the bundler splits each into its own
// chunk and a language is downloaded the first time someone picks it. A key is
// `locale` for the default namespace or `locale:namespace` for another one.
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

// Connect your Comvi project: set `VITE_COMVI_CDN_URL` at build time and the
// catalogs come from the CDN, with the local files as the offline fallback.
const cdnUrl: string | undefined = import.meta.env.VITE_COMVI_CDN_URL;
const loader = cdnUrl ? cdn(cdnUrl, { fallback: bundled }) : fromBundle;

/** The locales and namespaces whose catalogs have arrived, in order. */
export const fetched = { locales: [] as string[], namespaces: [] as string[] };

/** `t()` never throws: problems are reported to `onError`. This one keeps the distinct missing keys. */
export const missedKeys = new Set<string>();

export const i18n = createI18n({
  locale: "en",
  // A key missing in one language shows the English text instead of the key.
  fallbackLocale: "en",
  loader: async (locale, ns, signal) => {
    const catalog = await loader(locale, ns, signal);
    if (!fetched.locales.includes(locale)) fetched.locales.push(locale);
    if (!fetched.namespaces.includes(ns)) fetched.namespaces.push(ns);
    return catalog;
  },
  plugins: [
    // A `?lang=` link wins, then the last choice (a cookie), then the browser's language.
    detect({ supported: [...locales] }),
    // Remembers every switch in that cookie.
    persist(),
    // Makes the instance visible to the Comvi browser extension.
    devtools(),
  ],
  onError(error) {
    if (error.code === "missing_key") missedKeys.add(`${error.ns}:${error.key}`);
  },
});
