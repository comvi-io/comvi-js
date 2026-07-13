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
   *   'en': () => import('./locales/en.json'),             // defaultNs
   *   'fr': () => import('./locales/fr.json'),             // defaultNs
   *   'en:dashboard': () => import('./locales/dashboard/en.json'),
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

export interface FetchRequestOptions {
  signal?: AbortSignal;
  next?: ExtendedFetchOptions["next"];
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

class RequestAbortedError extends Error {
  constructor(url: string) {
    super(`[FetchLoader] Request aborted: ${url}`);
    this.name = "AbortError";
  }
}

const isAborted = (error: unknown): boolean =>
  error instanceof Error && error.name === "AbortError";

/** Fetch with timeout, external cancellation, and SSR cache support */
async function fetchWithTimeout(
  url: string,
  options: ExtendedFetchOptions,
  timeoutMs: number,
  fetchFn: typeof fetch = fetch,
): Promise<Response> {
  const controller = new AbortController();
  const externalSignal = options.signal;
  const abortFromExternal = () => controller.abort(externalSignal?.reason);
  if (externalSignal?.aborted) {
    abortFromExternal();
  } else {
    externalSignal?.addEventListener("abort", abortFromExternal, { once: true });
  }
  let timedOut = false;
  const id = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  try {
    const r = await fetchFn(url, { ...options, signal: controller.signal } as RequestInit);
    return r;
  } catch (e) {
    if (timedOut && e instanceof Error && e.name === "AbortError")
      throw new Error(`Request timeout after ${timeoutMs}ms`);
    if (externalSignal?.aborted) throw new RequestAbortedError(url);
    throw e;
  } finally {
    clearTimeout(id);
    externalSignal?.removeEventListener("abort", abortFromExternal);
  }
}

async function parseJsonResponse<T>(response: Response, url: string): Promise<T> {
  try {
    return (await response.json()) as T;
  } catch {
    throw new Error(`[FetchLoader] Invalid JSON response from ${url}`);
  }
}

/** Strip trailing slash */
const stripSlash = (url: string) => url.replace(/\/$/, "");

/**
 * Build request headers. When apiKey is empty (proxy/transport mode, where
 * authentication is attached outside the page) no Authorization header is
 * sent from page code.
 */
function buildAuthHeaders(apiKey: string): Record<string, string> {
  const headers: Record<string, string> = { Accept: "application/json" };
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;
  return headers;
}

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
interface PendingProjectInfo {
  promise: Promise<ProjectInfo>;
  controller: AbortController;
  signalConsumers: number;
  hasUncancellableConsumer: boolean;
}
const pendingProjectInfoCache = new Map<string, PendingProjectInfo>();
const projectInfoCacheGenerations = new Map<string, number>();
let projectInfoGlobalGeneration = 0;

function joinPendingProjectInfo(
  pending: PendingProjectInfo,
  signal: AbortSignal | undefined,
  url: string,
): Promise<ProjectInfo> {
  if (!signal) {
    pending.hasUncancellableConsumer = true;
    return pending.promise;
  }
  if (signal.aborted) {
    if (pending.signalConsumers === 0 && !pending.hasUncancellableConsumer) {
      pending.controller.abort();
    }
    return Promise.reject(new RequestAbortedError(url));
  }

  pending.signalConsumers++;
  return new Promise<ProjectInfo>((resolve, reject) => {
    let released = false;
    const release = () => {
      if (released) return;
      released = true;
      signal.removeEventListener("abort", onAbort);
      pending.signalConsumers--;
      if (pending.signalConsumers === 0 && !pending.hasUncancellableConsumer) {
        pending.controller.abort();
      }
    };
    const onAbort = () => {
      release();
      reject(new RequestAbortedError(url));
    };

    signal.addEventListener("abort", onAbort, { once: true });
    pending.promise.then(
      (info) => {
        release();
        resolve(info);
      },
      (error: unknown) => {
        release();
        reject(error);
      },
    );
  });
}

/**
 * Fetch project info from API using the apiKey
 * Results are cached with a 1-hour TTL to avoid redundant requests
 */
export async function fetchProjectInfo(
  apiKey: string,
  apiBaseUrl?: string,
  timeoutMs = 5000,
  fetchFn?: typeof fetch,
  cacheScope?: string,
  requestOptions?: FetchRequestOptions,
): Promise<ProjectInfo> {
  const baseUrl = stripSlash(apiBaseUrl || API_BASE_URL);
  // The default cache identity is baseUrl+apiKey. Callers using a custom
  // transport (where apiKey may be empty and the real credential lives
  // elsewhere) MUST pass a cacheScope, otherwise unrelated transports would
  // share project metadata.
  const cacheKey = cacheScope ? `scope::${cacheScope}` : `${baseUrl}::${apiKey}`;
  if (!cacheScope && !apiKey && fetchFn) {
    // Custom transport without an explicit scope: skip caching entirely
    // rather than risk cross-project bleed on a degenerate cache key.
    return fetchProjectInfoFromApi(apiKey, baseUrl, timeoutMs, fetchFn, requestOptions);
  }
  const cached = projectInfoCache.get(cacheKey);
  if (cached && Date.now() < cached.expiresAt) return cached.info;

  const pending = pendingProjectInfoCache.get(cacheKey);
  if (pending) {
    return joinPendingProjectInfo(pending, requestOptions?.signal, `${baseUrl}/v1/project`);
  }

  const controller = new AbortController();
  const globalGeneration = projectInfoGlobalGeneration;
  const cacheGeneration = projectInfoCacheGenerations.get(cacheKey) ?? 0;
  const entry = {} as PendingProjectInfo;
  entry.controller = controller;
  entry.signalConsumers = 0;
  entry.hasUncancellableConsumer = false;
  entry.promise = fetchProjectInfoFromApi(apiKey, baseUrl, timeoutMs, fetchFn, {
    ...requestOptions,
    signal: controller.signal,
  })
    .then((info) => {
      if (
        projectInfoGlobalGeneration === globalGeneration &&
        (projectInfoCacheGenerations.get(cacheKey) ?? 0) === cacheGeneration &&
        pendingProjectInfoCache.get(cacheKey) === entry
      ) {
        projectInfoCache.set(cacheKey, { info, expiresAt: Date.now() + PROJECT_INFO_TTL_MS });
      }
      return info;
    })
    .finally(() => {
      if (pendingProjectInfoCache.get(cacheKey) === entry) {
        pendingProjectInfoCache.delete(cacheKey);
      }
    });
  pendingProjectInfoCache.set(cacheKey, entry);
  return joinPendingProjectInfo(entry, requestOptions?.signal, `${baseUrl}/v1/project`);
}

async function fetchProjectInfoFromApi(
  apiKey: string,
  baseUrl: string,
  timeoutMs: number,
  fetchFn?: typeof fetch,
  requestOptions?: FetchRequestOptions,
): Promise<ProjectInfo> {
  const urls = [`${baseUrl}/v1/project`, `${baseUrl}/api/v1/api/project`];
  let lastNotFound: Response | undefined;

  for (const url of urls) {
    const response = await fetchWithTimeout(
      url,
      { headers: buildAuthHeaders(apiKey), ...requestOptions },
      timeoutMs,
      fetchFn,
    );

    if (response.ok) {
      return parseJsonResponse<ProjectInfo>(response, url);
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
 * Clear cached project info. With a cacheScope, clears only entries cached
 * under that scope (used by the in-context editor on deactivation); without
 * one, clears everything (useful for testing).
 */
export function clearProjectInfoCache(cacheScope?: string): void {
  if (cacheScope !== undefined) {
    const cacheKey = `scope::${cacheScope}`;
    projectInfoCacheGenerations.set(cacheKey, (projectInfoCacheGenerations.get(cacheKey) ?? 0) + 1);
    projectInfoCache.delete(cacheKey);
    pendingProjectInfoCache.delete(cacheKey);
    return;
  }
  projectInfoGlobalGeneration += 1;
  projectInfoCache.clear();
  pendingProjectInfoCache.clear();
  projectInfoCacheGenerations.clear();
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
  const namespaces = (response as ExportApiResponse | undefined)?.namespaces;
  if (!namespaces || typeof namespaces !== "object" || Array.isArray(namespaces)) {
    throw new Error('[FetchLoader] Invalid API response: "namespaces" must be an object');
  }
  const store: TranslationStore = new Map();
  for (const [ns, locales] of Object.entries(namespaces))
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
  fetchFn?: typeof fetch,
  cacheScope?: string,
  requestOptions?: FetchRequestOptions,
): Promise<TranslationStore> {
  const requestedNamespaces = [...new Set(namespaces)];
  const headers = buildAuthHeaders(apiKey);
  const url = buildApiTranslationsUrl(locale, requestedNamespaces, apiBaseUrl);
  const response = await fetchWithTimeout(url, { headers, ...requestOptions }, timeoutMs, fetchFn);

  if (response.ok) {
    return transformApiResponse(await parseJsonResponse<ExportApiResponse>(response, url));
  }

  if (response.status !== 404) {
    throw new Error(`API error: ${response.status} ${response.statusText}`);
  }

  const projectId = (
    await fetchProjectInfo(apiKey, apiBaseUrl, timeoutMs, fetchFn, cacheScope, requestOptions)
  ).id;
  const exportUrl = buildApiExportUrl(projectId, locale, requestedNamespaces, apiBaseUrl);
  let responseUrl = exportUrl;
  let exportResponse = await fetchWithTimeout(
    exportUrl,
    { headers, ...requestOptions },
    timeoutMs,
    fetchFn,
  );

  if (!exportResponse.ok && exportResponse.status === 404) {
    const legacyUrl = buildLegacyApiExportUrl(projectId, locale, requestedNamespaces, apiBaseUrl);
    responseUrl = legacyUrl;
    exportResponse = await fetchWithTimeout(
      legacyUrl,
      { headers, ...requestOptions },
      timeoutMs,
      fetchFn,
    );
  }

  if (!exportResponse.ok) {
    throw new Error(`API error: ${exportResponse.status} ${exportResponse.statusText}`);
  }

  return transformApiResponse(
    await parseJsonResponse<ExportApiResponse>(exportResponse, responseUrl),
  );
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
 *     'en': () => import('./locales/en.json'),
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

    const inflight = new Set<AbortController>();
    let stopped = false;
    const trackRequest = () => {
      const controller = new AbortController();
      if (stopped) controller.abort();
      inflight.add(controller);
      return {
        signal: controller.signal,
        release: () => inflight.delete(controller),
      };
    };
    const abortAll = () => {
      stopped = true;
      for (const controller of inflight) controller.abort();
      inflight.clear();
    };
    const reportSuccess = (locale: string, namespace: string) => {
      if (!stopped) onLoadSuccess?.(locale, namespace);
    };
    const reportError = (locale: string, namespace: string, error: Error) => {
      if (!stopped) onLoadError?.(locale, namespace, error);
    };

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
          const { signal, release } = trackRequest();
          try {
            for (const [k, v] of await fetchApiTranslations(
              apiKey,
              locale,
              requestedNamespaces,
              apiBaseUrl,
              timeout,
              undefined,
              undefined,
              { signal, ...cacheOpts },
            ))
              store.set(k, v);
            if (signal.aborted || stopped) throw new RequestAbortedError("API translations");
            for (const ns of requestedNamespaces) {
              if (store.has(`${locale}:${ns}`)) reportSuccess(locale, ns);
            }
          } catch (error) {
            if (signal.aborted || stopped || isAborted(error)) {
              throw new RequestAbortedError("API translations");
            }
            const err = toError(error);
            for (const ns of requestedNamespaces) {
              const ck = `${locale}:${ns}`;
              if (!store.has(ck)) {
                const fallbackResult = await tryFallback(
                  fallback,
                  locale,
                  ns,
                  defaultNs,
                  reportSuccess,
                  reportError,
                );
                if (signal.aborted || stopped) {
                  throw new RequestAbortedError("API translation fallback");
                }
                if (fallbackResult.attempted) attemptedFallbacks.add(ck);
                if (fallbackResult.data) {
                  store.set(ck, fallbackResult.data as Record<string, string>);
                } else if (!fallbackResult.attempted) {
                  reportError(locale, ns, err);
                }
              }
            }
          } finally {
            release();
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
            reportSuccess,
          );
          if (stopped) throw new RequestAbortedError("API translation fallback");
          if (fallbackResult.data) {
            return fallbackResult.data;
          }
        }

        const error = new Error(`[FetchLoader] No translations found for ${ck}`);
        reportError(locale, namespace, error);
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
        abortAll();
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
          const { signal, release } = trackRequest();
          const url = buildCdnUrl(cdnUrl, locale, namespace, defaultNs);
          try {
            const r = await fetchWithTimeout(
              url,
              { headers: { Accept: "application/json" }, signal, ...cacheOpts },
              timeout,
            );
            if (!r.ok) throw new Error(`HTTP ${r.status}: ${r.statusText}`);

            const data = await parseJsonResponse<Record<string, TranslationValue>>(r, url);
            if (signal.aborted || stopped) throw new RequestAbortedError(url);
            reportSuccess(locale, namespace);
            return data;
          } catch (error) {
            if (signal.aborted || stopped || isAborted(error)) {
              throw new RequestAbortedError(url);
            }
            const err = toError(error);
            const fallbackResult = await tryFallback(
              fallback,
              locale,
              namespace,
              defaultNs,
              reportSuccess,
              reportError,
            );
            if (signal.aborted || stopped) throw new RequestAbortedError(url);
            if (fallbackResult.data) {
              return fallbackResult.data;
            }
            if (fallbackResult.attempted) {
              throw fallbackResult.error ?? err;
            }
            reportError(locale, namespace, err);
            throw err;
          } finally {
            release();
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
        abortAll();
        loading.clear();
      };
    }
  };
};
