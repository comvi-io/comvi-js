import { headers } from "next/headers";
import { getRequestLocaleFromCache } from "./cache";

/**
 * Header name set by middleware to pass locale to Server Components
 */
const LOCALE_HEADER = "x-comvi-locale";

/**
 * Get the current request locale
 *
 * This function reads the locale from:
 * 1. Request cache (set by setRequestLocale)
 * 2. x-comvi-locale header (set by middleware)
 *
 * @returns The current locale
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
  // First check if setRequestLocale was called
  const cachedLocale = getRequestLocaleFromCache();
  if (cachedLocale) {
    return cachedLocale;
  }

  // Fallback to middleware header
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
