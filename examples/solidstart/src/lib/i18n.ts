import { createI18n, type I18n, type Loader } from "@comvi/solid";
import { getRequestEvent, isServer } from "solid-js/web";

export const locales = ["en", "uk", "de", "ar"];
export const fallbackLocale = "en";

const bundled = {
  en: () => import("../locales/en.json"),
  uk: () => import("../locales/uk.json"),
  de: () => import("../locales/de.json"),
  ar: () => import("../locales/ar.json"),
  "en:account": () => import("../locales/account/en.json"),
  "uk:account": () => import("../locales/account/uk.json"),
  "de:account": () => import("../locales/account/de.json"),
  "ar:account": () => import("../locales/account/ar.json"),
};

const loader: Loader = async (locale, ns) => {
  const load = bundled[(ns === "default" ? locale : `${locale}:${ns}`) as keyof typeof bundled];
  if (!load) throw new Error(`No bundled catalog for ${locale}/${ns}`);
  return (await load()).default;
};

// `timeZone`: the server and the browser format dates in one zone.
const options = { fallbackLocale, timeZone: "UTC", loader };

declare global {
  interface Window {
    __I18N__?: object;
  }
}

let browser: I18n | undefined;

/**
 * This request's instance on the server, kept on the request event so two visitors in two
 * languages never share one. The browser has one: it starts from what the server handed over
 * (`entry-server.tsx`), so it renders the same text and fetches none of it. `locale` comes from
 * the route, whose `matchFilters` has checked it against `locales` (createI18n throws a
 * RangeError for what is not a tag).
 */
export function i18nFor(locale: string): I18n {
  if (!isServer) return (browser ||= createI18n({ ...options, locale, ...window.__I18N__ }));
  const { locals } = getRequestEvent()!;
  return (locals.i18n ||= createI18n({ ...options, locale }));
}

/** English lives at `/`, every other locale under its own prefix. */
export function localePath(locale: string, path = "/") {
  if (locale === fallbackLocale) return path;
  return path === "/" ? `/${locale}` : `/${locale}${path}`;
}
