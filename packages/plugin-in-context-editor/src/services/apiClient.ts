/**
 * Shared API client utilities
 * Provides common functions for making authenticated API requests
 */

import { getApiConfig } from "../config/api";

/** Request init accepted by apiFetch. */
export interface ApiFetchInit {
  method?: string;
  /**
   * Extra headers, merged over the defaults. Deliberately NOT forwarded in
   * transport mode: the transport owner (extension service worker) sets a
   * fixed header set including authentication — page code cannot influence
   * headers on proxied requests.
   */
  headers?: Record<string, string>;
  body?: string;
  keepalive?: boolean;
  /** Caller-side cancellation, forwarded in both modes. */
  signal?: AbortSignal;
}

/**
 * Perform an API request for the given scope.
 *
 * In direct mode the request goes to the configured base URL with a bearer
 * Authorization header. In transport (proxy) mode the request is delegated
 * to the configured transport with only the path — authentication is
 * attached outside the page context and the API key never appears here.
 *
 * @param scopeId - Optional runtime scope used to isolate editor instances
 * @param path - Path relative to the API base URL (e.g. "/v1/keys")
 * @param init - Request options
 */
export function apiFetch(
  scopeId: string | undefined,
  path: string,
  init?: ApiFetchInit,
): Promise<Response> {
  const config = getApiConfig(scopeId);

  if (config.transport) {
    return config.transport(path, {
      method: init?.method,
      body: init?.body,
      keepalive: init?.keepalive,
      signal: init?.signal,
    });
  }

  return fetch(config.baseUrl + path, {
    method: init?.method,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.apiKey}`,
      ...init?.headers,
    },
    body: init?.body,
    keepalive: init?.keepalive,
    signal: init?.signal,
  });
}

/**
 * Get API base URL from configuration
 * @param scopeId - Optional runtime scope used to isolate editor instances
 * @returns Base URL string
 */
export function getBaseUrl(scopeId?: string): string {
  const { baseUrl } = getApiConfig(scopeId);
  return baseUrl;
}
