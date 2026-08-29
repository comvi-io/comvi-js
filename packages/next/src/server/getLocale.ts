import { headers } from "next/headers";
import { getRequestLocaleFromCache } from "./cache";

// Set by the middleware to pass the locale to Server Components.
const LOCALE_HEADER = "x-comvi-locale";

/**
 * Get the current request locale, from — in order — the request cache (set by
 * setRequestLocale) and the x-comvi-locale header (set by middleware).
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
    return localeFromHeader;
  }

  throw new Error(
    "[comvi/next] Unable to determine locale. " +
      "Make sure to call setRequestLocale() in your layout/page or configure middleware.",
  );
}
