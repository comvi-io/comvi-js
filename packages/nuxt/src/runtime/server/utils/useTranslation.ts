import type { H3Event } from "h3";
import { getCookie, getHeader } from "h3";
import type { TranslationParams } from "@comvi/core";
import { getServerRuntimeConfig } from "./runtime-config";
import { getRequestI18n } from "./request-i18n";
import { resolveAcceptLanguage } from "../../utils/resolve-locale";

/**
 * Options for useTranslation
 */
export interface UseTranslationOptions {
  /**
   * Default namespace for translations
   */
  namespace?: string;

  /**
   * Explicit locale (overrides detection)
   */
  locale?: string;
}

/**
 * Translation function type for server-side usage
 */
export interface ServerTranslationFunction {
  <NS extends import("@comvi/core").Namespaces, K extends import("@comvi/core").NamespacedKeys<NS>>(
    key: K,
    ...params: import("@comvi/core").NamespacedParamsArg<NS, K>
  ): string;
  <K extends import("@comvi/core").DefaultNsKeys>(
    key: K,
    ...params: import("@comvi/core").ParamsArg<K>
  ): string;
  (key: import("@comvi/core").PermissiveKey, params?: TranslationParams): string;
}

/**
 * Server-side translation result
 */
export interface UseTranslationResult {
  /** Translation function */
  t: ServerTranslationFunction;
  /** Detected/provided locale */
  locale: string;
  /** Check if translation exists */
  hasTranslation: (key: string, opts?: { locale?: string; ns?: string }) => boolean;
}

/**
 * Server-side translation utility for API routes and server middleware
 *
 * Detects locale from:
 * 1. Explicit locale option
 * 2. Cookie (i18n_locale)
 * 3. Accept-Language header
 * 4. Default locale
 *
 * @param event - H3 event from the request
 * @param options - Configuration options
 * @returns Translation function and locale info
 *
 * @example
 * ```typescript
 * // server/api/hello.ts
 * export default defineEventHandler(async (event) => {
 *   const { t, locale } = await useTranslation(event)
 *   return {
 *     message: t('api.hello'),
 *     locale
 *   }
 * })
 * ```
 *
 * @example
 * ```typescript
 * // With explicit namespace
 * const { t } = await useTranslation(event, { namespace: 'api' })
 * return { message: t('hello') }
 * ```
 */
export async function useTranslation(
  event: H3Event,
  options: UseTranslationOptions = {},
): Promise<UseTranslationResult> {
  // Get runtime config
  const config = getServerRuntimeConfig(event);
  const publicConfig = config.public.comvi;

  const {
    locales = [],
    defaultLocale = "en",
    cookieName = "i18n_locale",
    defaultNs = "default",
    detectBrowserLanguage,
  } = publicConfig;
  const namespace = options.namespace || defaultNs;

  const detectConfig =
    detectBrowserLanguage === false
      ? false
      : {
          useCookie: true,
          ...(typeof detectBrowserLanguage === "object" ? detectBrowserLanguage : {}),
        };
  const useCookieForDetection = detectConfig !== false && detectConfig.useCookie === true;
  const fallbackLocale =
    detectConfig && "fallbackLocale" in detectConfig && detectConfig.fallbackLocale
      ? detectConfig.fallbackLocale
      : defaultLocale;
  const resolvedFallbackLocale = locales.includes(fallbackLocale) ? fallbackLocale : defaultLocale;

  // Detect locale
  let locale = options.locale;

  // 1. Check cookie
  if (!locale && useCookieForDetection) {
    const cookieLocale = getCookie(event, cookieName);
    if (cookieLocale && locales.includes(cookieLocale)) {
      locale = cookieLocale;
    }
  }

  // 2. Check Accept-Language header
  if (!locale && detectConfig !== false) {
    const acceptLanguage = getHeader(event, "accept-language");
    if (acceptLanguage) {
      locale = resolveAcceptLanguage(acceptLanguage, locales);
    }
  }

  // 3. Fallback to default
  const resolvedLocale = locale || resolvedFallbackLocale;

  // Get or create per-request i18n instance
  const i18n = await getRequestI18n(event, resolvedLocale);

  // Ensure translations are loaded for the requested locale
  if (!i18n.hasLocale(resolvedLocale, namespace)) {
    await loadTranslationsForLocale(i18n, resolvedLocale, [namespace]);
  }

  // Create translation function bound to the resolved locale
  const t: ServerTranslationFunction = ((key: string, params?: TranslationParams) => {
    const result = i18n.t(key, {
      ...params,
      language: resolvedLocale,
      ns: params?.ns ?? namespace,
    });
    // Server expects string
    return typeof result === "string" ? result : String(result);
  }) as ServerTranslationFunction;

  // Create hasTranslation helper
  const hasTranslation = (key: string, opts?: { locale?: string; ns?: string }) => {
    return i18n.hasTranslation(key, opts?.locale ?? resolvedLocale, opts?.ns ?? namespace);
  };

  return { t, locale: resolvedLocale, hasTranslation };
}

/**
 * Load translations for a specific locale
 */
async function loadTranslationsForLocale(
  i18n: import("@comvi/core").I18n,
  locale: string,
  namespaces: string[],
): Promise<void> {
  // Ensure we're loading for the correct locale
  if (i18n.locale !== locale) {
    await i18n.setLocaleAsync(locale);
  }

  // Load each namespace
  for (const ns of namespaces) {
    try {
      await i18n.addActiveNamespace(ns);
    } catch (error) {
      console.warn(`[@comvi/nuxt] Failed to load ${locale}:${ns}:`, error);
    }
  }
}
