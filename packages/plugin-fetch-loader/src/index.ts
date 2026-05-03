import type { I18nPlugin, I18nPluginFactory, TranslationValue } from "@comvi/core";
import type { ExportApiResponse, TranslationStore } from "./types";

/**
 * Fallback import function type
 * Returns a module with default export containing translations
 */
export type FallbackImport = () => Promise<{ default: Record<string, TranslationValue> }>;

/**
 * Fallback map for offline/error scenarios
 *
 * Key formats:
 * - "lang:namespace" - explicit namespace (e.g., 'en:dashboard')
 * - "lang" - shorthand for defaultNs (e.g., 'en' resolves to 'en:{defaultNs}')
 */
export type FallbackMap = Record<string, FallbackImport>;

/**
 * Project info returned from API
 */
export interface ProjectInfo {
  id: number;
  organizationId: number;
  name: string;
  description: string | null;
  sourceLocale: string;
}

/**
 * Options for FetchLoader plugin
 */
export interface FetchLoaderOptions {
  /**
   * Full CDN URL for production mode requests.
   * This is the base URL where translations are hosted.
   *
   * URL patterns:
   * - Default namespace: {cdnUrl}/{lang}.json
   * - Other namespaces: {cdnUrl}/{namespace}/{lang}.json
   *
   * @example
   * ```typescript
   * cdnUrl: "https://cdn.comvi.io/51db17c3d52f4e7eba810b7bb9b6576b"
   * ```
   */
  cdnUrl: string;

  /**
   * API base URL for dev mode requests.
   * Required for Next.js/Nuxt because env vars aren't available in pre-built packages.
   *
   * @example
   * ```typescript
   * apiBaseUrl: process.env.NEXT_PUBLIC_COMVI_API_URL || "https://api.comvi.io"
   * ```
   */
  apiBaseUrl?: string;

  /**
   * Fallback imports when fetch fails (for offline/PWA scenarios)
   *
   * Key formats:
   * - "lang:namespace" - explicit namespace
   * - "lang" - uses defaultNs
   *
   * @example
   * ```typescript
   * fallback: {
   *   'en': () => import('./locales/en/common.json'),      // defaultNs
   *   'fr': () => import('./locales/fr/common.json'),      // defaultNs
   *   'en:dashboard': () => import('./locales/en/dashboard.json'),
   * }
   * ```
   */
  fallback?: FallbackMap;

  /**
   * Callback when loading fails
   */
  onLoadError?: (locale: string, namespace: string, error: Error) => void;

  /**
   * Callback when loading succeeds
   */
  onLoadSuccess?: (locale: string, namespace: string) => void;

  /**
   * Request timeout in milliseconds
   * @default 10000
   */
  timeout?: number;

  /**
   * Whether to load translations during init()
   * @default true
   *
   * Note: Language changes are automatically handled by the core.
   * The registered loader will be called automatically when locale changes.
   */
  loadOnInit?: boolean;

  /**
   * Cache options for SSR frameworks (Next.js, Nuxt, etc.)
   *
   * These options are passed to fetch() for server-side caching.
   * Works with Next.js fetch cache, Nuxt useFetch, and similar.
   *
   * @example
   * ```typescript
   * // Next.js - cache for 1 hour
   * cache: { revalidate: 3600 }
   *
   * // Next.js - with cache tags for on-demand revalidation
   * cache: { revalidate: 3600, tags: ['i18n', 'translations'] }
   *
   * // Disable caching (always fresh)
   * cache: { revalidate: 0 }
   * ```
   */
  cache?: {
    /**
     * Time in seconds to cache the response.
     * - number: Cache for N seconds
     * - 0: No caching (always fetch fresh)
     * - false: Cache indefinitely
     */
    revalidate?: number | false;

    /**
     * Cache tags for on-demand revalidation.
     * Use with Next.js revalidateTag() or similar.
     */
    tags?: string[];
  };
}

// Re-export types
export type { ExportApiResponse, TranslationStore } from "./types";

/**
 * Key used to store FetchLoader config on i18n instance
 * @internal
 */
export const FETCH_LOADER_PLUGIN_KEY = "fetchLoader";

/**
 * Get FetchLoader configuration from i18n instance.
 * Used by @comvi/next's loadTranslations() for Next.js fetch caching.
 *
 * @param i18n - The i18n instance to get config from
 * @returns The FetchLoader config or undefined if not configured
 */
export function getFetchLoaderConfig(i18n: {
  getPluginData: <T>(key: string) => T | undefined;
}): FetchLoaderOptions | undefined {
  return i18n.getPluginData<FetchLoaderOptions>(FETCH_LOADER_PLUGIN_KEY);
}

/**
 * Production API base URL.
 * Can be overridden via VITE_API_BASE_URL or NEXT_PUBLIC_COMVI_API_URL for local development.
 */
export const API_BASE_URL =
  // @ts-expect-error - import.meta.env is Vite-specific
  import.meta.env?.VITE_API_BASE_URL ||
  (typeof process !== "undefined" && process.env?.NEXT_PUBLIC_COMVI_API_URL) ||
  "https://api.comvi.io";

/**
 * Production CDN base URL.
 * Can be overridden via VITE_CDN_BASE_URL or NEXT_PUBLIC_COMVI_CDN_URL for local development.
 */
export const CDN_BASE_URL =
  // @ts-expect-error - import.meta.env is Vite-specific
  import.meta.env?.VITE_CDN_BASE_URL ||
  (typeof process !== "undefined" && process.env?.NEXT_PUBLIC_COMVI_CDN_URL) ||
  "https://cdn.comvi.io";

/** Extended fetch options with SSR cache support */
interface ExtendedFetchOptions extends RequestInit {
  next?: { revalidate?: number | false; tags?: string[] };
}

/** Build cache options for SSR frameworks */
function buildCacheOptions(
  cache?: FetchLoaderOptions["cache"],
): Pick<ExtendedFetchOptions, "next"> {
  if (!cache) return {};
  const next: ExtendedFetchOptions["next"] = {};
  if (cache.revalidate !== undefined) next.revalidate = cache.revalidate;
  if (cache.tags?.length) next.tags = cache.tags;
  return Object.keys(next).length ? { next } : {};
}

/** Fetch with timeout and SSR cache support */
async function fetchWithTimeout(
  url: string,
  options: ExtendedFetchOptions,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const r = await fetch(url, { ...options, signal: controller.signal } as RequestInit);
    clearTimeout(id);
    return r;
  } catch (e) {
    clearTimeout(id);
    if (e instanceof Error && e.name === "AbortError")
      throw new Error(`Request timeout after ${timeoutMs}ms`);
    throw e;
  }
}

/** Strip trailing slash */
const stripSlash = (url: string) => url.replace(/\/$/, "");

/** Ensure value is Error instance */
const toError = (e: unknown): Error => (e instanceof Error ? e : new Error(String(e)));

/** Validate locale/namespace identifiers to prevent malformed URLs */
const VALID_ID = /^[\w\-@.]+$/;

function validateId(value: string, label: string): void {
  if (!value || !VALID_ID.test(value))
    throw new Error(
      `[FetchLoader] Invalid ${label}: "${value}". Only alphanumeric, underscore, hyphen, dot, and @ characters are allowed.`,
    );
}

/** Cache for project info by API base URL + API key with TTL */
const PROJECT_INFO_TTL_MS = 60 * 60 * 1000; // 1 hour
const projectInfoCache = new Map<string, { info: ProjectInfo; expiresAt: number }>();
const pendingProjectInfoCache = new Map<string, Promise<ProjectInfo>>();

/**
 * Fetch project info from API using the apiKey
 * Results are cached with a 1-hour TTL to avoid redundant requests
 */
export async function fetchProjectInfo(
  apiKey: string,
  apiBaseUrl?: string,
  timeoutMs = 5000,
): Promise<ProjectInfo> {
  const baseUrl = stripSlash(apiBaseUrl || API_BASE_URL);
  const cacheKey = `${baseUrl}::${apiKey}`;
  const cached = projectInfoCache.get(cacheKey);
  if (cached && Date.now() < cached.expiresAt) return cached.info;
  const pending = pendingProjectInfoCache.get(cacheKey);
  if (pending) return pending;

  const promise = fetchProjectInfoFromApi(apiKey, baseUrl, timeoutMs);

  pendingProjectInfoCache.set(cacheKey, promise);
  try {
    const info = await promise;
    projectInfoCache.set(cacheKey, { info, expiresAt: Date.now() + PROJECT_INFO_TTL_MS });
    return info;
  } finally {
    pendingProjectInfoCache.delete(cacheKey);
  }
}

async function fetchProjectInfoFromApi(
  apiKey: string,
  baseUrl: string,
  timeoutMs: number,
): Promise<ProjectInfo> {
  const urls = [`${baseUrl}/v1/project`, `${baseUrl}/api/v1/api/project`];
  let lastNotFound: Response | undefined;

  for (const url of urls) {
    const response = await fetchWithTimeout(
      url,
      { headers: { Accept: "application/json", Authorization: `Bearer ${apiKey}` } },
      timeoutMs,
    );

    if (response.ok) {
      return (await response.json()) as ProjectInfo;
    }

    if (response.status === 404) {
      lastNotFound = response;
      continue;
    }

    throw new Error(`Failed to fetch project info: ${response.status} ${response.statusText}`);
  }

  throw new Error(
    `Failed to fetch project info: ${lastNotFound?.status ?? 404} ${lastNotFound?.statusText ?? "Not Found"}`,
  );
}

/**
 * Clear project info cache (useful for testing)
 * @internal
 */
export function clearProjectInfoCache(): void {
  projectInfoCache.clear();
  pendingProjectInfoCache.clear();
}

/** Build API export URL for dev mode */
export function buildApiExportUrl(
  projectId: number | string,
  locale: string,
  namespaces: string[],
  customApiBaseUrl?: string,
): string {
  validateId(locale, "locale");
  for (const ns of namespaces) validateId(ns, "namespace");
  const params = new URLSearchParams();
  params.set("locales", locale);
  params.set("namespaces", namespaces.join(","));
  return `${stripSlash(customApiBaseUrl || API_BASE_URL)}/v1/projects/${projectId}/export?${params.toString()}`;
}

/** Build API translations URL for runtime/dev mode */
export function buildApiTranslationsUrl(
  locale: string,
  namespaces: string[],
  customApiBaseUrl?: string,
): string {
  validateId(locale, "locale");
  for (const ns of namespaces) validateId(ns, "namespace");
  const params = new URLSearchParams();
  params.set("locales", locale);
  params.set("namespaces", namespaces.join(","));
  return `${stripSlash(customApiBaseUrl || API_BASE_URL)}/v1/translations?${params.toString()}`;
}

/** Build legacy API export URL for older backend deployments */
function buildLegacyApiExportUrl(
  projectId: number | string,
  locale: string,
  namespaces: string[],
  customApiBaseUrl?: string,
): string {
  const params = new URLSearchParams();
  params.set("locales", locale);
  params.set("namespaces", namespaces.join(","));
  return `${stripSlash(customApiBaseUrl || API_BASE_URL)}/api/v1/api/projects/${projectId}/export?${params.toString()}`;
}

/**
 * Build CDN URL for production mode
 * - Default namespace: {cdnUrl}/{locale}.json
 * - Other namespaces: {cdnUrl}/{ns}/{locale}.json
 */
export function buildCdnUrl(
  cdnUrl: string,
  locale: string,
  namespace: string,
  defaultNs: string,
): string {
  validateId(locale, "locale");
  validateId(namespace, "namespace");
  const base = stripSlash(cdnUrl);
  return namespace === defaultNs ? `${base}/${locale}.json` : `${base}/${namespace}/${locale}.json`;
}

/**
 * Resolve fallback import function
 *
 * Resolution order:
 * 1. Exact key "locale:namespace"
 * 2. Shorthand "locale" (only if ns === defaultNs)
 */
export function resolveFallback(
  fallback: FallbackMap | undefined,
  locale: string,
  ns: string,
  defaultNs: string,
): FallbackImport | undefined {
  if (!fallback) return undefined;
  return fallback[`${locale}:${ns}`] || (ns === defaultNs ? fallback[locale] : undefined);
}

interface FallbackLoadResult {
  attempted: boolean;
  data?: Record<string, TranslationValue>;
  error?: Error;
}

/** Try to load from fallback, returning data or error details */
async function tryFallback(
  fallback: FallbackMap | undefined,
  locale: string,
  ns: string,
  defaultNs: string,
  onSuccess?: (locale: string, ns: string) => void,
  onError?: (locale: string, ns: string, err: Error) => void,
): Promise<FallbackLoadResult> {
  const importFn = resolveFallback(fallback, locale, ns, defaultNs);
  if (!importFn) return { attempted: false };
  try {
    const mod = await importFn();
    onSuccess?.(locale, ns);
    return { attempted: true, data: mod.default };
  } catch (e) {
    const error = toError(e);
    onError?.(locale, ns, error);
    return { attempted: true, error };
  }
}

/** Transform API response to internal cache format */
export function transformApiResponse(response: ExportApiResponse): TranslationStore {
  const store: TranslationStore = new Map();
  for (const [ns, locales] of Object.entries(response.namespaces))
    for (const [locale, translations] of Object.entries(locales))
      store.set(`${locale}:${ns}`, translations);
  return store;
}

/**
 * Fetch translations from the Comvi API runtime endpoint.
 *
 * This is the same API path used by FetchLoader in dev mode. It is exported so
 * tooling such as the browser extension can refresh active namespaces without
 * duplicating translation URL logic.
 */
export async function fetchApiTranslations(
  apiKey: string,
  locale: string,
  namespaces: string[],
  apiBaseUrl?: string,
  timeoutMs = 5000,
): Promise<TranslationStore> {
  const requestedNamespaces = [...new Set(namespaces)];
  const headers = {
    Accept: "application/json",
    Authorization: `Bearer ${apiKey}`,
  };
  const url = buildApiTranslationsUrl(locale, requestedNamespaces, apiBaseUrl);
  const response = await fetchWithTimeout(url, { headers }, timeoutMs);

  if (response.ok) {
    return transformApiResponse((await response.json()) as ExportApiResponse);
  }

  if (response.status !== 404) {
    throw new Error(`API error: ${response.status} ${response.statusText}`);
  }

  const projectId = (await fetchProjectInfo(apiKey, apiBaseUrl, timeoutMs)).id;
  const exportUrl = buildApiExportUrl(projectId, locale, requestedNamespaces, apiBaseUrl);
  let exportResponse = await fetchWithTimeout(exportUrl, { headers }, timeoutMs);

  if (!exportResponse.ok && exportResponse.status === 404) {
    const legacyUrl = buildLegacyApiExportUrl(projectId, locale, requestedNamespaces, apiBaseUrl);
    exportResponse = await fetchWithTimeout(legacyUrl, { headers }, timeoutMs);
  }

  if (!exportResponse.ok) {
    throw new Error(`API error: ${exportResponse.status} ${exportResponse.statusText}`);
  }

  return transformApiResponse((await exportResponse.json()) as ExportApiResponse);
}

/**
 * Fetch Loader Plugin
 *
 * Loads translations from Comvi's backend API in development mode
 * and from CDN in production mode.
 *
 * @example
 * ```typescript
 * import { createI18n } from '@comvi/core';
 * import { FetchLoader } from '@comvi/plugin-fetch-loader';
 *
 * const i18n = createI18n({
 *   locale: 'en',
 *   apiKey: 'your-api-key',
 * })
 * .use(FetchLoader({
 *   cdnUrl: 'https://cdn.comvi.io/your-distribution-id',
 *   fallback: {
 *     'en': () => import('./locales/en/common.json'),
 *   },
 *   onLoadError: (locale, ns, error) => console.error('Load failed:', error)
 * }));
 *
 * await i18n.init();
 * ```
 */
export const FetchLoader: I18nPluginFactory<FetchLoaderOptions> = (options): I18nPlugin => {
  if (!options?.cdnUrl) throw new Error("[FetchLoader] cdnUrl is required");

  const {
    cdnUrl,
    apiBaseUrl,
    fallback,
    onLoadError,
    onLoadSuccess,
    timeout = 10000,
    loadOnInit = true,
    cache,
  } = options;

  const cacheOpts = buildCacheOptions(cache);

  return async (i18n) => {
    i18n.setPluginData(FETCH_LOADER_PLUGIN_KEY, options);

    const defaultNs = i18n.getDefaultNamespace();
    const apiKey = i18n.apiKey;
    // During i18n.init(), core loads initial namespaces after every plugin has
    // registered its hooks. Loading here would emit namespaceLoaded too early
    // for later plugins such as the in-context editor.
    const shouldLoadImmediately = loadOnInit && !i18n.isInitializing;

    if (apiKey) {
      const pending = new Map<
        string,
        Promise<{ store: TranslationStore; attemptedFallbacks: Set<string> }>
      >();

      const fetchFromApi = async (
        locale: string,
        namespaces: string[],
      ): Promise<{ store: TranslationStore; attemptedFallbacks: Set<string> }> => {
        const requestedNamespaces = [...new Set(namespaces)];
        const key = `${locale}:${[...requestedNamespaces].sort().join(",")}`;
        const existing = pending.get(key);
        if (existing) return existing;

        const promise = (async () => {
          const store: TranslationStore = new Map();
          const attemptedFallbacks = new Set<string>();
          try {
            for (const [k, v] of await fetchApiTranslations(
              apiKey,
              locale,
              requestedNamespaces,
              apiBaseUrl,
              timeout,
            ))
              store.set(k, v);
            for (const ns of requestedNamespaces) {
              if (store.has(`${locale}:${ns}`)) onLoadSuccess?.(locale, ns);
            }
          } catch (error) {
            const err = toError(error);
            for (const ns of requestedNamespaces) {
              const ck = `${locale}:${ns}`;
              if (!store.has(ck)) {
                const fallbackResult = await tryFallback(
                  fallback,
                  locale,
                  ns,
                  defaultNs,
                  onLoadSuccess,
                  onLoadError,
                );
                if (fallbackResult.attempted) attemptedFallbacks.add(ck);
                if (fallbackResult.data) {
                  store.set(ck, fallbackResult.data as Record<string, string>);
                } else if (!fallbackResult.attempted) {
                  onLoadError?.(locale, ns, err);
                }
              }
            }
          } finally {
            pending.delete(key);
          }

          return { store, attemptedFallbacks };
        })();

        pending.set(key, promise);
        return promise;
      };

      i18n.registerLoader(async (locale, namespace) => {
        const ck = `${locale}:${namespace}`;
        const active = i18n.getActiveNamespaces();
        const { store, attemptedFallbacks } = await fetchFromApi(
          locale,
          active.includes(namespace) ? active : [...active, namespace],
        );

        const cached = store.get(ck);
        if (cached) return cached;

        if (!attemptedFallbacks.has(ck)) {
          const fallbackResult = await tryFallback(
            fallback,
            locale,
            namespace,
            defaultNs,
            onLoadSuccess,
          );
          if (fallbackResult.data) {
            return fallbackResult.data;
          }
        }

        const error = new Error(`[FetchLoader] No translations found for ${ck}`);
        onLoadError?.(locale, namespace, error);
        throw error;
      });

      if (shouldLoadImmediately) {
        const loc = i18n.locale;
        const active = i18n.getActiveNamespaces();
        const nss = active.length > 0 ? active : [defaultNs];
        try {
          const { store } = await fetchFromApi(loc, nss);
          const translations: Record<string, Record<string, TranslationValue>> = {};
          for (const ns of nss) {
            const data = store.get(`${loc}:${ns}`);
            if (data) translations[`${loc}:${ns}`] = data;
          }
          if (Object.keys(translations).length > 0) {
            i18n.addTranslations(translations);
          }
        } catch {
          // Errors already reported via onLoadError
        }
      }

      return () => {
        pending.clear();
      };
    } else {
      const loading = new Map<string, Promise<Record<string, TranslationValue>>>();

      const loaderFn = async (
        locale: string,
        namespace: string,
      ): Promise<Record<string, TranslationValue>> => {
        const ck = `${locale}:${namespace}`;
        const existing = loading.get(ck);
        if (existing) return existing;

        const promise = (async () => {
          try {
            const r = await fetchWithTimeout(
              buildCdnUrl(cdnUrl, locale, namespace, defaultNs),
              { headers: { Accept: "application/json" }, ...cacheOpts },
              timeout,
            );
            if (!r.ok) throw new Error(`HTTP ${r.status}: ${r.statusText}`);

            const data = (await r.json()) as Record<string, TranslationValue>;
            onLoadSuccess?.(locale, namespace);
            return data;
          } catch (error) {
            const err = toError(error);
            const fallbackResult = await tryFallback(
              fallback,
              locale,
              namespace,
              defaultNs,
              onLoadSuccess,
              onLoadError,
            );
            if (fallbackResult.data) {
              return fallbackResult.data;
            }
            if (fallbackResult.attempted) {
              throw fallbackResult.error ?? err;
            }
            onLoadError?.(locale, namespace, err);
            throw err;
          } finally {
            loading.delete(ck);
          }
        })();

        loading.set(ck, promise);
        return promise;
      };

      i18n.registerLoader(loaderFn);

      if (shouldLoadImmediately) {
        const loc = i18n.locale;
        const active = i18n.getActiveNamespaces();
        const nss = active.length > 0 ? active : [defaultNs];
        try {
          await Promise.all(
            nss.map(async (ns) => {
              const data = await loaderFn(loc, ns);
              i18n.addTranslations({ [`${loc}:${ns}`]: data });
            }),
          );
        } catch {
          // Errors already reported via onLoadError
        }
      }

      return () => {
        loading.clear();
      };
    }
  };
};
