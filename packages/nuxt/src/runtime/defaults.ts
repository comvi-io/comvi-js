import type { LocaleDetectionSource } from "../types";

/** `localeCookie` defaults. Only the name differs from `@comvi/next`'s. */
export const DEFAULT_LOCALE_COOKIE = {
  name: "i18n_locale",
  maxAge: 365 * 24 * 60 * 60,
  secure: true,
  sameSite: "lax",
} as const;

/**
 * `localeDetection.order` default: the same as `@comvi/next`'s. `query` is inert
 * until `queryParam` is set.
 */
export const DEFAULT_DETECTION_ORDER: readonly LocaleDetectionSource[] = [
  "query",
  "cookie",
  "accept-language",
];
