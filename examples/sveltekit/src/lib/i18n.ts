import type { I18nOptions, Loader } from "@comvi/svelte";

export const locales = ["en", "uk", "de", "ar"];
export const fallbackLocale = "en";

/** One import per catalog; a locale is read the first time it is needed. */
const bundled = {
  en: () => import("../locales/en.json"),
  uk: () => import("../locales/uk.json"),
  de: () => import("../locales/de.json"),
  ar: () => import("../locales/ar.json"),
};

const loader: Loader = async (locale) => {
  const load = bundled[locale as keyof typeof bundled];
  if (!load) throw new Error(`No bundled catalog for ${locale}`);
  return (await load()).default;
};

/**
 * What the server's and the browser's instances share. The time zone is required for a
 * server render: both sides must format a date alike.
 */
export const options: Omit<I18nOptions, "locale"> = { fallbackLocale, timeZone: "UTC", loader };

/** English lives at `/`, every other locale under its own prefix. */
export function localePath(locale: string, path = "/") {
  if (locale === fallbackLocale) return path;
  return path === "/" ? `/${locale}` : `/${locale}${path}`;
}
