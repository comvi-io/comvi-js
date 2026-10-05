import { headers } from "next/headers";
import { getConfiguredRouting, getRequestLocaleFromCache } from "./cache";

declare const __DEV__: boolean | undefined;
const IS_DEV = typeof __DEV__ !== "undefined" && __DEV__;

// Set by the middleware to pass the locale to Server Components.
const LOCALE_HEADER = "x-comvi-locale";

// A BCP-47-shaped code: a 2–3 letter language, then subtags of 2–8
// alphanumerics. Enough to keep a path, a URL or a header injection out of the
// lookup locale a loader builds its request from.
const LOCALE_CODE = /^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8})*$/;

// Once per process: the header is per request, and a crawler sending a bad
// one must not fill the log.
let warnedIgnoredHeader = false;

/**
 * Get the current request locale, from — in order — the request cache (set by
 * setRequestLocale) and the x-comvi-locale header (set by middleware).
 *
 * The header is client-controlled on any path the middleware does not run on,
 * so it is honoured only when it is one of `routing.locales` (with a `routing`
 * export) or a well-formed locale code (without one). Any other value is
 * ignored: the request falls back to `routing.defaultLocale`, or, with no
 * routing, to the "Unable to determine locale" error.
 *
 * @throws Error if locale cannot be determined
 *
 * @example
 * ```tsx
 * import { getLocale } from '@comvi/next/server';
 *
 * export default async function Page() {
 *   const locale = await getLocale();
 *   return <p>Current locale: {locale}</p>;
 * }
 * ```
 */
export async function getLocale(): Promise<string> {
  const cachedLocale = getRequestLocaleFromCache();
  if (cachedLocale) {
    return cachedLocale;
  }

  const headersList = await headers();
  const localeFromHeader = headersList.get(LOCALE_HEADER);

  if (localeFromHeader) {
    const routing = getConfiguredRouting();
    const accepted = routing?.locales
      ? routing.locales.includes(localeFromHeader)
      : LOCALE_CODE.test(localeFromHeader);
    if (accepted) {
      return localeFromHeader;
    }
    if (IS_DEV && !warnedIgnoredHeader) {
      warnedIgnoredHeader = true;
      console.warn(
        `[@comvi/next] Ignored the x-comvi-locale header ${JSON.stringify(localeFromHeader)}: ` +
          (routing?.locales
            ? `it is not in routing.locales (${routing.locales.join(", ")}).`
            : "it is not a locale code."),
      );
    }
    if (routing?.defaultLocale) {
      return routing.defaultLocale;
    }
  }

  throw new Error(
    "[@comvi/next] Unable to determine locale. " +
      "Make sure to call setRequestLocale() in your layout/page or configure middleware.",
  );
}
