import { cdn } from "@comvi/core/cdn";
import type { Loader } from "@comvi/core";
import { createGetI18n } from "@comvi/next/server";
import { options, routing } from "./routing";

// One dynamic `import()` per catalog, read the first time a request needs it. A
// key is `locale` for the default namespace or `locale:namespace` for another one.
const bundled = {
  en: () => import("../locales/en.json").then((m) => m.default),
  uk: () => import("../locales/uk.json").then((m) => m.default),
  de: () => import("../locales/de.json").then((m) => m.default),
  ar: () => import("../locales/ar.json").then((m) => m.default),
  "en:account": () => import("../locales/account/en.json").then((m) => m.default),
  "uk:account": () => import("../locales/account/uk.json").then((m) => m.default),
  "de:account": () => import("../locales/account/de.json").then((m) => m.default),
  "ar:account": () => import("../locales/account/ar.json").then((m) => m.default),
};

const fromBundle: Loader = async (locale, ns) => {
  const load = bundled[(ns === "default" ? locale : `${locale}:${ns}`) as keyof typeof bundled];
  if (!load) throw new Error(`No bundled catalog for ${locale}/${ns}`);
  return load();
};

// Connect your Comvi project: set `NEXT_PUBLIC_COMVI_CDN_URL` at build time and
// the catalogs come from the CDN, with the local files as the offline fallback.
const cdnUrl: string | undefined = process.env.NEXT_PUBLIC_COMVI_CDN_URL;

// Server only (`@comvi/next/server` imports "server-only"): each request gets
// its own instance, with the catalogs the page asked for.
export const getI18n = createGetI18n({
  ...routing,
  ...options,
  // The server and the browser format dates in this zone.
  timeZone: "UTC",
  loader: cdnUrl ? cdn(cdnUrl, { fallback: bundled }) : fromBundle,
});
