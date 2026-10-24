import { createI18n, icuCompiler, loader } from "@comvi/solid";

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

/** Loads one locale's catalogs on the server, in an instance of its own, and returns them as data. */
export async function loadI18n(requested: string) {
  "use server";

  // A server function is an endpoint any client can call, so the locale is checked here too.
  const locale = locales.includes(requested) ? requested : fallbackLocale;
  // The browser instance's compiler: the development build checks every
  // catalog against it on load.
  const i18n = createI18n({ locale, fallbackLocale, compiler: icuCompiler }).use(catalogLoader());
  await i18n.init();

  const namespace = i18n.getDefaultNamespace();
  const messages = Object.fromEntries(
    [locale, fallbackLocale]
      .filter((loc) => i18n.hasLocale(loc, namespace))
      .map((loc) => [`${loc}:${namespace}`, i18n.getMessages(loc, namespace)]),
  );
  return { locale, messages };
}
