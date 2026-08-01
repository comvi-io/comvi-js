import type { TranslationValue } from "@comvi/core";

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
 * Controls how namespaces map to CDN paths.
 */
export interface CdnLayoutOptions {
  /**
   * Namespace stored directly at `{cdnUrl}/{locale}.json`.
   *
   * When omitted, the i18n instance's `defaultNs` is used for backward
   * compatibility. Set a namespace explicitly when the CDN root namespace
   * differs from the consumer's `defaultNs`, or set `false` when every
   * namespace is stored under its own folder.
   */
  rootNamespace?: string | false;
}

/**
 * Options for FetchLoader plugin
 */
export interface FetchLoaderOptions {
  /**
   * Full CDN URL for production mode requests.
   * This is the base URL where translations are hosted.
   *
   * URL patterns are controlled by `cdnLayout`:
   * - Root namespace: {cdnUrl}/{lang}.json
   * - Other namespaces: {cdnUrl}/{namespace}/{lang}.json
   *
   * @example
   * ```typescript
   * cdnUrl: "https://cdn.comvi.io/51db17c3d52f4e7eba810b7bb9b6576b"
   * ```
   */
  cdnUrl: string;

  /**
   * Explicit API base URL for dev mode requests — the documented way to point
   * the loader at an API host. Takes precedence over the legacy `apiBaseUrl`
   * option and over the build-time environment overrides
   * (`VITE_API_BASE_URL` / `NEXT_PUBLIC_COMVI_API_URL`).
   *
   * When absent, the environment overrides apply, then the Comvi platform
   * preset (`comviPreset.apiBaseUrl`) as the final fallback.
   *
   * @example
   * ```typescript
   * baseUrl: "https://api.my-proxy.example.com"
   * ```
   */
  baseUrl?: string;

  /**
   * API base URL for dev mode requests.
   * Required for Next.js/Nuxt because env vars aren't available in pre-built packages.
   *
   * Prefer `baseUrl`; when both are set, `baseUrl` wins.
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
   * CDN namespace-to-path mapping. This affects CDN mode only; API mode
   * always requests namespaces explicitly.
   *
   * @default { rootNamespace: i18n.defaultNs }
   */
  cdnLayout?: CdnLayoutOptions;

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

/**
 * Key used to store FetchLoader config on i18n instance
 * @internal
 */
export const FETCH_LOADER_PLUGIN_KEY = "fetchLoader";

/**
 * Get FetchLoader configuration from i18n instance.
 *
 * Returns the options the FetchLoader plugin was constructed with, or
 * `undefined` when the plugin is not installed on the instance.
 */
export function getFetchLoaderConfig(i18n: {
  getPluginData: <T>(key: string) => T | undefined;
}): FetchLoaderOptions | undefined {
  return i18n.getPluginData<FetchLoaderOptions>(FETCH_LOADER_PLUGIN_KEY);
}

/**
 * Comvi platform preset: the hosted API and CDN base URLs.
 *
 * Applied as the final fallback when neither an explicit option (`baseUrl` /
 * `apiBaseUrl`) nor a build-time environment override is present. Platform
 * users get these defaults without configuration; self-hosted or proxied
 * setups pass `baseUrl` explicitly.
 */
export const comviPreset = {
  apiBaseUrl: "https://api.comvi.io",
  cdnBaseUrl: "https://cdn.comvi.io",
} as const;

/**
 * Production API base URL.
 * Can be overridden via VITE_API_BASE_URL or NEXT_PUBLIC_COMVI_API_URL for local development.
 */
export const API_BASE_URL =
  // @ts-expect-error - import.meta.env is Vite-specific
  import.meta.env?.VITE_API_BASE_URL ||
  (typeof process !== "undefined" && process.env?.NEXT_PUBLIC_COMVI_API_URL) ||
  comviPreset.apiBaseUrl;

/**
 * Production CDN base URL.
 * Can be overridden via VITE_CDN_BASE_URL or NEXT_PUBLIC_COMVI_CDN_URL for local development.
 */
export const CDN_BASE_URL =
  // @ts-expect-error - import.meta.env is Vite-specific
  import.meta.env?.VITE_CDN_BASE_URL ||
  (typeof process !== "undefined" && process.env?.NEXT_PUBLIC_COMVI_CDN_URL) ||
  comviPreset.cdnBaseUrl;
