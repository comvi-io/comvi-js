/**
 * The API request path's URL builders and response transform, on top of the
 * shared transport primitives in `http-core.ts`.
 *
 * Those primitives are re-exported here so every existing `from "./http"`
 * import — this package's own modules and `@comvi/next` / `@comvi/nuxt` through
 * the root entry — keeps resolving to one name.
 */
import type { ExportApiResponse, TranslationStore } from "./types";
import { API_BASE_URL } from "./options";
import { assertCatalogObject, stripSlash, validateId } from "./http-core";

/** Names this request path in the shape errors `assertCatalogObject` raises. */
const API = "API";

export type { ExtendedFetchOptions, FetchRequestOptions, JsonResult } from "./http-core";
export {
  ERROR_PREFIX,
  RequestAbortedError,
  buildCacheOptions,
  fetchJsonWithTimeout,
  isAborted,
  isSafeId,
  isTimeout,
  stripSlash,
  toError,
} from "./http-core";
export { buildCdnUrl } from "./cdn-url";

/**
 * Build request headers. When apiKey is empty (proxy/transport mode, where
 * authentication is attached outside the page) no Authorization header is
 * sent from page code.
 */
export function buildAuthHeaders(apiKey: string): Record<string, string> {
  const headers: Record<string, string> = { Accept: "application/json" };
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;
  return headers;
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
export function buildLegacyApiExportUrl(
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
  return `${stripSlash(customApiBaseUrl || API_BASE_URL)}/api/v1/api/projects/${projectId}/export?${params.toString()}`;
}

/** Transform API response to internal cache format */
export function transformApiResponse(response: ExportApiResponse): TranslationStore {
  const namespaces = (response as ExportApiResponse | undefined)?.namespaces;
  assertCatalogObject(namespaces, API, "namespaces");
  const store: TranslationStore = new Map();
  for (const [ns, locales] of Object.entries(namespaces)) {
    assertCatalogObject(locales, API, `namespaces.${ns}`);
    for (const [locale, translations] of Object.entries(locales)) {
      assertCatalogObject(translations, API, `namespaces.${ns}.${locale}`);
      store.set(`${locale}:${ns}`, translations);
    }
  }
  return store;
}
