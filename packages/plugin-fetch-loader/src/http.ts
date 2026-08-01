import type { ExportApiResponse, TranslationStore } from "./types";
import type { CdnLayoutOptions, FetchLoaderOptions } from "./options";
import { API_BASE_URL } from "./options";

/** Extended fetch options with SSR cache support */
export interface ExtendedFetchOptions extends RequestInit {
  next?: { revalidate?: number | false; tags?: string[] };
}

export interface FetchRequestOptions {
  signal?: AbortSignal;
  next?: ExtendedFetchOptions["next"];
}

/** Build cache options for SSR frameworks */
export function buildCacheOptions(
  cache?: FetchLoaderOptions["cache"],
): Pick<ExtendedFetchOptions, "next"> {
  if (!cache) return {};
  const next: ExtendedFetchOptions["next"] = {};
  if (cache.revalidate !== undefined) next.revalidate = cache.revalidate;
  if (cache.tags?.length) next.tags = cache.tags;
  return Object.keys(next).length ? { next } : {};
}

export class RequestAbortedError extends Error {
  constructor(url: string) {
    super(`[FetchLoader] Request aborted: ${url}`);
    this.name = "AbortError";
  }
}

export const isAborted = (error: unknown): boolean =>
  error instanceof Error && error.name === "AbortError";

/** Fetch with timeout, external cancellation, and SSR cache support */
export async function fetchWithTimeout(
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

export async function parseJsonResponse<T>(response: Response, url: string): Promise<T> {
  try {
    return (await response.json()) as T;
  } catch {
    throw new Error(`[FetchLoader] Invalid JSON response from ${url}`);
  }
}

/** Strip trailing slash */
export const stripSlash = (url: string) => url.replace(/\/$/, "");

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

/** Ensure value is Error instance */
export const toError = (e: unknown): Error => (e instanceof Error ? e : new Error(String(e)));

/** Validate locale/namespace identifiers to prevent malformed URLs */
const VALID_ID = /^[\w\-@.]+$/;

function validateId(value: string, label: string): void {
  if (!value || value === "." || value === ".." || !VALID_ID.test(value))
    throw new Error(
      `[FetchLoader] Invalid ${label}: "${value}". Only alphanumeric, underscore, hyphen, dot, and @ characters are allowed; dot-only path segments are rejected.`,
    );
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
  const params = new URLSearchParams();
  params.set("locales", locale);
  params.set("namespaces", namespaces.join(","));
  return `${stripSlash(customApiBaseUrl || API_BASE_URL)}/api/v1/api/projects/${projectId}/export?${params.toString()}`;
}

/**
 * Build CDN URL for production mode
 * - Root namespace: {cdnUrl}/{locale}.json
 * - Other namespaces: {cdnUrl}/{ns}/{locale}.json
 */
export function buildCdnUrl(
  cdnUrl: string,
  locale: string,
  namespace: string,
  defaultNs: string,
  layout: CdnLayoutOptions = {},
): string {
  validateId(locale, "locale");
  validateId(namespace, "namespace");
  const rootNamespace = layout.rootNamespace === undefined ? defaultNs : layout.rootNamespace;
  if (rootNamespace !== false) validateId(rootNamespace, "CDN root namespace");
  const base = stripSlash(cdnUrl);
  return rootNamespace !== false && namespace === rootNamespace
    ? `${base}/${locale}.json`
    : `${base}/${namespace}/${locale}.json`;
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
