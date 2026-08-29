import type { ExportApiResponse, TranslationStore } from "./types";
import type { ProjectInfo } from "./options";
import { API_BASE_URL } from "./options";
import type { FetchRequestOptions } from "./http";
import {
  RequestAbortedError,
  buildApiExportUrl,
  buildApiTranslationsUrl,
  buildAuthHeaders,
  buildLegacyApiExportUrl,
  fetchWithTimeout,
  parseJsonResponse,
  stripSlash,
  transformApiResponse,
} from "./http";

const PROJECT_INFO_TTL_MS = 60 * 60 * 1000;
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

/** Results are cached for `PROJECT_INFO_TTL_MS`; concurrent callers share one request. */
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
