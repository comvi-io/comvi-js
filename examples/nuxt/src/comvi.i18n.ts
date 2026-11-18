import { cdn, defineI18nOptions, devtools, type Loader } from "@comvi/nuxt/i18n";
import { useRuntimeConfig } from "#imports";
import { reportMissingKey } from "./composables/missingKeys";

// One dynamic import per catalog, so a locale is bundled separately and fetched the
// first time it is needed. `locale:namespace` keys belong to a namespace a page loads.
// A dynamic import gives a module: return its `default`, the catalog itself.
const bundled = {
  en: () => import("./locales/en.json").then((m) => m.default),
  uk: () => import("./locales/uk.json").then((m) => m.default),
  de: () => import("./locales/de.json").then((m) => m.default),
  ar: () => import("./locales/ar.json").then((m) => m.default),
  "en:account": () => import("./locales/account/en.json").then((m) => m.default),
  "uk:account": () => import("./locales/account/uk.json").then((m) => m.default),
  "de:account": () => import("./locales/account/de.json").then((m) => m.default),
  "ar:account": () => import("./locales/account/ar.json").then((m) => m.default),
};

// A loader is a function: (locale, namespace, signal) → catalog.
const fromBundle: Loader = async (locale, ns) => {
  const load = bundled[(ns === "default" ? locale : `${locale}:${ns}`) as keyof typeof bundled];
  if (!load) throw new Error(`No bundled catalog for ${locale}/${ns}`);
  return load();
};

// The functions of the i18n instance; its data (locales, the fallback, the time zone)
// are `comvi` in nuxt.config.ts. The module calls this once in the browser and once
// per server request.
export default defineI18nOptions((event) => {
  // Set NUXT_PUBLIC_COMVI_CDN_URL to load your Comvi project's published catalogs
  // instead; the bundled files stay as the fallback if the CDN is down.
  const cdnUrl = useRuntimeConfig(event).public.comviCdnUrl as string;
  return {
    loader: cdnUrl ? cdn(cdnUrl, { fallback: bundled }) : fromBundle,
    // Makes the instance visible to the Comvi browser extension.
    plugins: [devtools()],
    // t() never throws: every problem is reported here. A missing key is reported while a
    // component renders, so the counter updates after the render, and only in the
    // browser, where the count is shown.
    onError(error) {
      if (error.code === "missing_key" && typeof window !== "undefined")
        queueMicrotask(() => reportMissingKey(`${error.ns}:${error.key}`));
    },
  };
});
