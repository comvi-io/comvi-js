/**
 * Shared API client utilities
 * Provides common functions for making authenticated API requests
 */

import { getApiConfig } from "../config/api";

/**
 * Create headers for API requests with authentication
 * @param scopeId - Optional runtime scope used to isolate editor instances
 * @returns Headers object with Content-Type and Authorization
 */
export function getHeaders(scopeId?: string): HeadersInit {
  const { apiKey } = getApiConfig(scopeId);
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${apiKey}`,
  };
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
