import { cache } from "react";
import type { I18n } from "@comvi/core";
import type { RequestStore } from "./types";

/**
 * Request-scoped locale storage using React cache()
 * This allows setRequestLocale() to store locale that getTranslations() can read
 *
 * React's cache() creates a per-request memoized value in Server Components,
 * allowing us to share state across the component tree without prop drilling.
 */
const getRequestStore = cache(
  (): RequestStore => ({
    locale: undefined,
  }),
);

/**
 * Global i18n reference (set once via setI18n)
 * This is safe because Next.js creates separate module instances for server/client
 */
let globalI18n: I18n | undefined;

/**
 * Configure the global i18n instance for server-side usage
 *
 * Call this once in your i18n configuration file to make getTranslations() work.
 *
 * @param i18n - The i18n instance created with createI18n
 *
 * @example
 * ```typescript
 * // i18n/index.ts
 * import { createI18n } from '@comvi/next';
 * import { setI18n } from '@comvi/next/server';
 * import { translations } from './translations';
 *
 * export const i18n = createI18n({
 *   locale: 'en',
 *   defaultNs: 'default',
 *   translation: translations,
 * });
 *
 * // Configure for server-side usage
 * setI18n(i18n);
 * ```
 */
export function setI18n(i18n: I18n): void {
  globalI18n = i18n;
}

/**
 * Get the global i18n instance
 * @internal
 */
export function getI18nInstance(): I18n {
  if (!globalI18n) {
    throw new Error(
      "[comvi/next] i18n not configured. " + "Call setI18n(i18n) in your i18n configuration file.",
    );
  }
  return globalI18n;
}

/**
 * Set the request locale in the cache
 * @internal
 */
export function setRequestLocaleInternal(locale: string): void {
  getRequestStore().locale = locale;
}

/**
 * Get the request locale from cache
 * @internal
 */
export function getRequestLocaleFromCache(): string | undefined {
  return getRequestStore().locale;
}
