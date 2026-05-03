import type { I18nPlugin, I18nPluginFactory } from "@comvi/core";

/**
 * Detection source types
 */
export type DetectorType =
  | "querystring"
  | "localStorage"
  | "sessionStorage"
  | "cookie"
  | "navigator";

/**
 * Cache target types (subset of detector types that support writing)
 */
export type CacheType = "localStorage" | "sessionStorage" | "cookie";

/**
 * Cookie options for setting cookies
 */
export interface CookieOptions {
  path?: string;
  domain?: string;
  sameSite?: "strict" | "lax" | "none";
  secure?: boolean;
}

/**
 * Options for LocaleDetector plugin
 */
export interface LocaleDetectorOptions {
  /**
   * Order of detection methods to try (stops at first match)
   * @default ['querystring', 'localStorage', 'sessionStorage', 'cookie', 'navigator']
   */
  order?: DetectorType[];

  /**
   * Where to cache the detected/changed locale
   * @default ['localStorage']
   */
  caches?: CacheType[];

  /**
   * Query parameter name for locale
   * @default 'lng'
   */
  lookupQuerystring?: string;

  /**
   * Cookie name for locale
   * @default 'i18n_lang'
   */
  lookupCookie?: string;

  /**
   * localStorage key for locale
   * @default 'i18n_locale'
   */
  lookupLocalStorage?: string;

  /**
   * sessionStorage key for locale
   * @default 'i18n_locale'
   */
  lookupSessionStorage?: string;

  /**
   * Cookie options
   */
  cookieOptions?: CookieOptions;

  /**
   * Cookie max age in seconds
   * @default 31536000 (1 year)
   */
  cookieMaxAge?: number;

  /**
   * Fallback locale if detection fails
   * @default Current i18n.locale at plugin initialization time
   */
  fallbackLocale?: string;

  /**
   * List of locales the application supports.
   * When provided, the detected locale is matched against this list using BCP 47 lookup:
   *   1. Exact match (case-insensitive): "de-DE" → "de-DE"
   *   2. Base language match: "de-DE" → "de"
   *   3. Regional variant match: "de" → "de-DE" (if only regional variant is supported)
   *
   * When not provided, the detected locale tag is truncated to the base language
   * for backwards compatibility (e.g., "de-DE" → "de").
   *
   * @example
   * ```typescript
   * LocaleDetector({
   *   supportedLocales: ['en', 'de', 'pt-BR', 'pt-PT', 'zh-Hans', 'zh-Hant'],
   * })
   * ```
   */
  supportedLocales?: string[];

  /**
   * Custom function to transform the detected locale tag before matching.
   * Receives the raw locale string from the detection source.
   * When provided, this replaces the default normalization entirely.
   *
   * @example
   * ```typescript
   * LocaleDetector({
   *   convertDetectedLocale: (lng) => lng.replace('_', '-'),
   * })
   * ```
   */
  convertDetectedLocale?: (locale: string) => string;
}

interface DetectionResult {
  locale: string;
  cache: boolean;
}

/**
 * Locale Detector Plugin
 *
 * Unified plugin for locale detection and persistence.
 * Combines detection from multiple sources with automatic caching.
 *
 * Features:
 * - Detects locale from: querystring, localStorage, sessionStorage, cookie, navigator
 * - Auto-caches detected locale to: localStorage, sessionStorage, cookie
 * - Configurable detection order
 * - SSR-safe with graceful fallbacks
 *
 * @example
 * ```typescript
 * import { createI18n } from '@comvi/core';
 * import { LocaleDetector } from '@comvi/plugin-locale-detector';
 *
 * const i18n = createI18n({ locale: 'en' })
 *   .use(LocaleDetector({
 *     order: ['querystring', 'localStorage', 'cookie', 'navigator'],
 *     caches: ['localStorage', 'cookie'],
 *     lookupQuerystring: 'lang',
 *     cookieMaxAge: 365 * 24 * 60 * 60 // 1 year
 *   }));
 * ```
 */
export const LocaleDetector: I18nPluginFactory<LocaleDetectorOptions> = (
  options = {},
): I18nPlugin => {
  const {
    order = ["querystring", "localStorage", "sessionStorage", "cookie", "navigator"],
    caches = ["localStorage"],
    lookupQuerystring = "lng",
    lookupCookie = "i18n_lang",
    lookupLocalStorage = "i18n_locale",
    lookupSessionStorage = "i18n_locale",
    cookieOptions = {},
    cookieMaxAge = 365 * 24 * 60 * 60, // 1 year
  } = options;

  const supportedLocales = options.supportedLocales;
  const convertDetectedLocale = options.convertDetectedLocale;

  const det: Record<DetectorType, () => string | null> = {
    querystring: () => detectQS(lookupQuerystring),
    localStorage: () => readStorage("localStorage", lookupLocalStorage),
    sessionStorage: () => readStorage("sessionStorage", lookupSessionStorage),
    cookie: () => readCookie(lookupCookie),
    navigator: detectNav,
  };

  const cfg = {
    ck: lookupCookie,
    ls: lookupLocalStorage,
    ss: lookupSessionStorage,
    co: cookieOptions,
    ma: cookieMaxAge,
  };

  return (i18n) => {
    const fallbackLocale = options.fallbackLocale ?? i18n.locale;
    // `pendingInitResult` only bridges a single `detect()` call to the immediately
    // following `localeChanged` event emitted by core during `init()`.
    // It exists so we can suppress cache writes for fallback-only resolutions.
    let pendingInitResult: DetectionResult | null = null;

    const process = (raw: string): DetectionResult => {
      if (convertDetectedLocale) {
        return { locale: convertDetectedLocale(raw), cache: true };
      }

      if (supportedLocales) {
        const resolved = resolveLocale(raw, supportedLocales);
        if (resolved) {
          return { locale: resolved, cache: true };
        }

        return { locale: fallbackLocale, cache: false };
      }

      return { locale: raw.split(SR)[0].toLowerCase(), cache: true };
    };

    const detectFromCache = (): DetectionResult | null => {
      if (caches.length === 0) return null;

      // Reads only the first configured cache target by design. `caches` defines
      // both persistence targets and the cache-priority source used on init.
      const firstCache = caches[0];
      const raw =
        firstCache === "cookie"
          ? readCookie(lookupCookie)
          : readStorage(
              firstCache,
              firstCache === "sessionStorage" ? lookupSessionStorage : lookupLocalStorage,
            );

      return raw && isValid(raw) ? process(raw) : null;
    };

    const handleCurrentLocaleMatch = (result: DetectionResult): void => {
      if (result.cache && result.locale === i18n.locale) {
        writeCaches(result.locale, caches, cfg);
        pendingInitResult = null;
      }
    };

    const detect = (): string => {
      const cached = detectFromCache();
      if (cached) {
        pendingInitResult = cached;
        handleCurrentLocaleMatch(cached);

        return cached.locale;
      }

      for (const m of order) {
        const d = det[m]();
        if (d && isValid(d)) {
          const result = process(d);
          pendingInitResult = result;
          handleCurrentLocaleMatch(result);

          return result.locale;
        }
      }

      pendingInitResult = { locale: fallbackLocale, cache: false };
      if (fallbackLocale === i18n.locale) {
        pendingInitResult = null;
      }

      return fallbackLocale;
    };

    i18n.registerLocaleDetector(detect);

    const unsub = i18n.on("localeChanged", ({ to: locale }) => {
      if (pendingInitResult) {
        const initResult = pendingInitResult;
        pendingInitResult = null;

        if (initResult.locale === locale && !initResult.cache) {
          return;
        }
      }

      writeCaches(locale, caches, cfg);
    });

    return () => {
      pendingInitResult = null;
      unsub();
    };
  };
};

const SR = /[-_]/;
const VR = /^[a-z]{2,8}([_-][a-z\d]{1,8})*$/i;
const win = () => typeof window !== "undefined";
const doc = () => typeof document !== "undefined";

function isValid(tag: string): boolean {
  return tag.length <= 35 && VR.test(tag);
}

function detectQS(key: string): string | null {
  return win() ? new URLSearchParams(window.location.search).get(key) || null : null;
}

function readStorage(type: "localStorage" | "sessionStorage", key: string): string | null {
  try {
    return (win() ? window[type] : undefined)?.getItem(key) || null;
  } catch {
    return null;
  }
}

function readCookie(name: string): string | null {
  if (!doc()) return null;
  for (const c of document.cookie.split(";")) {
    const eq = c.indexOf("=");
    if (eq === -1) continue;
    const k = c.slice(0, eq).trim();
    const v = c.slice(eq + 1).trim();
    if (k === name && v) {
      try {
        return decodeURIComponent(v);
      } catch {
        return null;
      }
    }
  }
  return null;
}

function detectNav(): string | null {
  return typeof navigator === "undefined"
    ? null
    : navigator.languages?.length
      ? navigator.languages[0]
      : navigator.language || null;
}

function writeCaches(
  locale: string,
  caches: CacheType[],
  cfg: { ck: string; ls: string; ss: string; co: CookieOptions; ma: number },
): void {
  for (const t of caches) {
    try {
      if (t === "cookie") {
        if (!doc()) continue;
        const { path: p = "/", domain: d, sameSite: s = "lax", secure: sc = false } = cfg.co;
        let v = `${cfg.ck}=${encodeURIComponent(locale)}; max-age=${cfg.ma}; path=${p}; samesite=${s}`;
        if (d) v += `; domain=${d}`;
        if (sc) v += "; secure";
        document.cookie = v;
      } else {
        if (win()) window[t]?.setItem(t === "sessionStorage" ? cfg.ss : cfg.ls, locale);
      }
    } catch {
      /* privacy mode, quota exceeded */
    }
  }
}

/**
 * Resolve a detected locale tag against a list of supported locales.
 * Uses BCP 47 lookup semantics (RFC 4647).
 */
export function resolveLocale(detected: string, supported: string[]): string | undefined {
  const lo = detected.toLowerCase();
  const lc = (s: string) => s.toLowerCase();

  const exact = supported.find((s) => lc(s) === lo);
  if (exact) return exact;

  const parts = lo.split(SR);
  for (let i = parts.length - 1; i >= 1; i--) {
    const m = supported.find((s) => lc(s) === parts.slice(0, i).join("-"));
    if (m) return m;
  }

  return supported.find((s) => lc(s).split(SR)[0] === parts[0]);
}
