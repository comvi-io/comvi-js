import { loader } from "@comvi/svelte";

export const locales = ["en", "uk", "de", "ar"];
export const fallbackLocale = "en";

/** One import per catalog; each instance gets its own loader. */
export const catalogLoader = () =>
  loader({
    en: () => import("../locales/en.json"),
    uk: () => import("../locales/uk.json"),
    de: () => import("../locales/de.json"),
    ar: () => import("../locales/ar.json"),
  });

/** English lives at `/`, every other locale under its own prefix. */
export function localePath(locale: string, path = "/") {
  if (locale === fallbackLocale) return path;
  return path === "/" ? `/${locale}` : `/${locale}${path}`;
}
