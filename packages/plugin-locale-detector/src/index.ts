import type { I18n, I18nPlugin, I18nPluginFactory, I18nPluginApi } from "@comvi/core";
import { attachPlugins, ensureInstallable } from "@comvi/core/plugins";

declare const __DEV__: boolean | undefined;

const IS_DEV = typeof __DEV__ !== "undefined" && __DEV__;

export type DetectorType =
  | "querystring"
  | "localStorage"
  | "sessionStorage"
  | "cookie"
  | "navigator";

/** The detector types that can also be written to. */
export type CacheType = "localStorage" | "sessionStorage" | "cookie";

export interface CookieOptions {
  path?: string;
  domain?: string;
  sameSite?: "strict" | "lax" | "none";
  secure?: boolean;
}

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
   * When true (default), the first cache target is consulted before the
   * detection order, so a persisted choice wins over everything in `order`.
   * Set to false to let `order` fully govern priority — e.g. when an explicit
   * query parameter must override the locale stored on a previous visit.
   * @default true
   */
  cacheFirst?: boolean;

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
   * Without `supportedLocales` or `convertDetectedLocale`, every detected and
   * cached tag is shortened to its base language; every visit resolves `pt-BR`
   * to `pt`. An app with a regional locale such as `pt-BR` must list it here.
   *
   * @example
   * ```typescript
   * localeDetectorPlugin({
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
   * localeDetectorPlugin({
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
 * Locale detection plus persistence, for an i18n instance that already has the
 * plugin capability; `localeDetector()` composes that capability for you. Every source and cache target is SSR-safe: a missing `window`
 * or `document` falls through instead of throwing.
 *
 * @example
 * ```typescript
 * import { createI18n } from '@comvi/core';
 * import { localeDetector } from '@comvi/plugin-locale-detector';
 *
 * const i18n = createI18n({ locale: 'en' }).use(
 *   localeDetector({
 *     supportedLocales: ['en', 'de', 'pt-BR'],
 *     order: ['querystring', 'localStorage', 'cookie', 'navigator'],
 *     caches: ['localStorage', 'cookie'],
 *     lookupQuerystring: 'lang',
 *     cookieMaxAge: 365 * 24 * 60 * 60, // 1 year
 *   }),
 * );
 * ```
 */
export const localeDetectorPlugin: I18nPluginFactory<LocaleDetectorOptions> = (
  options = {},
): I18nPlugin => {
  const {
    order = ["querystring", "localStorage", "sessionStorage", "cookie", "navigator"],
    caches = ["localStorage"],
    cacheFirst = true,
    lookupQuerystring = "lng",
    lookupCookie = "i18n_lang",
    lookupLocalStorage = "i18n_locale",
    lookupSessionStorage = "i18n_locale",
    cookieOptions = {},
    cookieMaxAge = 365 * 24 * 60 * 60,
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
    cookieKey: lookupCookie,
    localStorageKey: lookupLocalStorage,
    sessionStorageKey: lookupSessionStorage,
    cookieOptions,
    maxAge: cookieMaxAge,
  };

  return (i18n) => {
    // Development only: `IS_DEV` is `false` in the default artifact, so the
    // check and its text fold out of it.
    if (IS_DEV && !supportedLocales && !convertDetectedLocale) {
      console.warn(
        "[@comvi/plugin-locale-detector] localeDetector() was given no supportedLocales, so any " +
          "language the browser reports becomes the active locale and is cached, including one " +
          "this app has no translations for. Pass the locales you ship: " +
          'localeDetector({ supportedLocales: ["en", "de"] }).',
      );
    }

    const fallbackLocale = options.fallbackLocale ?? i18n.locale;
    // Bridges a single `detect()` call to the `localeChanged` event core emits
    // right after it, so a fallback-only resolution suppresses its cache write.
    let pendingInitResult: DetectionResult | null = null;

    const process = (raw: string): DetectionResult | null => {
      if (convertDetectedLocale) {
        return { locale: convertDetectedLocale(raw), cache: true };
      }

      if (supportedLocales) {
        const resolved = resolveLocale(raw, supportedLocales);
        if (resolved) {
          return { locale: resolved, cache: true };
        }

        return null;
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
      const cached = cacheFirst ? detectFromCache() : null;
      if (cached) {
        pendingInitResult = cached;
        handleCurrentLocaleMatch(cached);

        return cached.locale;
      }

      for (const m of order) {
        const d = det[m]();
        if (d && isValid(d)) {
          const result = process(d);
          if (!result) continue;

          pendingInitResult = result;
          handleCurrentLocaleMatch(result);

          return result.locale;
        }
      }

      // The fallback marker exists to bridge THIS `detect()` call to the one
      // `localeChanged` event `i18n.init()` emits right after it (see the
      // `pendingInitResult` declaration above). Core calls the registered
      // detector from exactly one place — inside `init()`'s `_beforeInit()`
      // step, which is bounded on both sides by `isInitializing` flipping
      // true (just before) and false (once `init()` fully settles, well
      // after `_beforeInit()` returns). `isInitializing` is therefore true
      // for core's own auto-apply call and false for every other caller,
      // BEFORE init() has ever run as much as AFTER it has finished — so a
      // manual re-consultation (e.g. a consumer calling
      // `getLanguageDetector()` directly, whether that happens before
      // `init()` was ever called or long after it settled) must never arm a
      // marker that could later swallow an unrelated, deliberate choice of
      // this same locale.
      pendingInitResult =
        !i18n.isInitializing || fallbackLocale === i18n.locale
          ? null
          : { locale: fallbackLocale, cache: false };

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

/** The i18n instance surface `localeDetector` guarantees on the way out. */
export type LocaleDetectorInstaller = <T extends I18n<any>>(i18n: T) => T & I18nPluginApi;

/**
 * The locale detector as a `.use(…)` installer.
 *
 * ```ts
 * const i18n = createI18n({ locale: "en" }).use(
 *   localeDetector({ supportedLocales: ["en", "uk", "de"], caches: ["cookie"] }),
 * );
 * await i18n.init();
 * ```
 *
 * The attach is idempotent: composing onto an i18n instance that already has the plugin
 * capability keeps every plugin already registered, and composing twice
 * registers the plugin twice, exactly as two `use` calls would. No loader
 * capability is composed — the detector hands core a locale, and core loads
 * namespaces through whatever loading the i18n instance already has.
 *
 * `required`, `timeout`, `onError`, cleanup registration and LIFO destroy are
 * not re-implemented here; they keep running inside `PluginI18nInstance`, because
 * the last thing this installer does is call `registerPlugin`.
 *
 * `registerPlugin(localeDetector(…))` is a type error, and at runtime fails at
 * `init()` on `ensureInstallable` before the plugin capability is attached.
 * Hand the `localeDetectorPlugin` factory to `registerPlugin` instead.
 */
export function localeDetector(options?: LocaleDetectorOptions): LocaleDetectorInstaller {
  return (i18n) => {
    const instance = attachPlugins(ensureInstallable(i18n, "localeDetector"));
    instance.registerPlugin(localeDetectorPlugin(options));
    return instance;
  };
}

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
  cfg: {
    cookieKey: string;
    localStorageKey: string;
    sessionStorageKey: string;
    cookieOptions: CookieOptions;
    maxAge: number;
  },
): void {
  for (const t of caches) {
    try {
      if (t === "cookie") {
        if (!doc()) continue;
        const {
          path: p = "/",
          domain: d,
          sameSite: s = "lax",
          secure: sc = false,
        } = cfg.cookieOptions;
        let v =
          `${cfg.cookieKey}=${encodeURIComponent(locale)}; ` +
          `max-age=${cfg.maxAge}; path=${p}; samesite=${s}`;
        if (d) v += `; domain=${d}`;
        // browsers reject SameSite=None cookies without Secure
        if (sc || s === "none") v += "; secure";
        document.cookie = v;
      } else {
        if (win())
          window[t]?.setItem(
            t === "sessionStorage" ? cfg.sessionStorageKey : cfg.localStorageKey,
            locale,
          );
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
