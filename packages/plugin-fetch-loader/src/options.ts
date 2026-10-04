import type { TranslationValue } from "@comvi/core";
import { FETCH_LOADER_PLUGIN_KEY } from "./plugin-key";

export type FallbackImport = () => Promise<{ default: Record<string, TranslationValue> }>;

/**
 * Fallback map for offline/error scenarios
 *
 * Key formats:
 * - "lang:namespace" - explicit namespace (e.g., 'en:dashboard')
 * - "lang" - shorthand for defaultNs (e.g., 'en' resolves to 'en:{defaultNs}')
 */
export type FallbackMap = Record<string, FallbackImport>;

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

export interface FetchLoaderOptions {
  /**
   * Full CDN URL for production mode requests.
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
   * the loader at an API host. Takes precedence over the build-time environment overrides
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

  onLoadError?: (locale: string, namespace: string, error: Error) => void;

  onLoadSuccess?: (locale: string, namespace: string) => void;

  /**
   * Request timeout in milliseconds
   * @default 10000
   */
  timeout?: number;

  /**
   * Retry the project-info request after a 429, a 5xx or a transport failure —
   * twice at most. The waits between attempts never add more than five seconds;
   * each attempt still runs under its own `timeout`. A timeout is never
   * retried, so a stalled server still fails as fast as `timeout` says.
   *
   * Only the project-info request is retried. The CDN namespace load and the
   * API translations request are not: core's fallback-locale loop already sits
   * behind them, and retrying there would multiply what `setLocale` costs
   * on a flapping CDN.
   * @default true
   */
  retry?: boolean;

  /**
   * Whether the plugin loads translations ITSELF at install time.
   *
   * It is NOT an opt-out of the initial network request, in either direction.
   * `init()` loads the initial namespaces through the registered loader on its
   * own, after every plugin has registered, and this flag has no say in that:
   * `.use(fetchLoader({ loadOnInit: false }))` followed by `await init()`
   * still issues exactly the request `loadOnInit: true` does. Nor does
   * `loadOnInit: true` add one — the plugin body runs inside `init()` on both
   * supported entry points (`.use(fetchLoader(…))` and `registerPlugin(fetchLoaderPlugin(…))`),
   * where `i18n.isInitializing` is already true, so the install-time load below
   * is skipped and `init()`'s own load is the only one.
   *
   * The flag therefore only matters when the plugin factory is invoked outside
   * `init()` — calling `fetchLoaderPlugin(options)(i18n)` by hand.
   *
   * To start with NO network request, tell core not to load an initial
   * namespace: `createI18n({ locale, ns: [] })`. `addActiveNamespace(ns)` (or a
   * locale change) then loads on demand.
   *
   * Note: Language changes are automatically handled by the core.
   * The registered loader will be called automatically when locale changes.
   *
   * @default true
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

export { FETCH_LOADER_PLUGIN_KEY } from "./plugin-key";

/**
 * Get fetchLoaderPlugin configuration from i18n instance.
 *
 * Returns the options the fetchLoaderPlugin plugin was constructed with, or
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

/** Production API base URL; the env overrides exist for local development. */
export const API_BASE_URL =
  // @ts-expect-error - import.meta.env is Vite-specific
  import.meta.env?.VITE_API_BASE_URL ||
  (typeof process !== "undefined" && process.env?.NEXT_PUBLIC_COMVI_API_URL) ||
  comviPreset.apiBaseUrl;
