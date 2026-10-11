/**
 * Build-time configuration.
 *
 * The API base URL is deliberately fixed at build time and mirrored into the
 * manifest's host_permissions by vite.config.ts. The service worker is the
 * only component that performs authenticated requests, and it only ever
 * talks to this origin — page code cannot redirect credentials elsewhere.
 */

// Required at build time by vite.config.ts.
const RAW_API_BASE_URL = import.meta.env.VITE_COMVI_API_BASE_URL as string;

/**
 * Strips every trailing slash so the value is safe to concatenate with a
 * leading-slash path: background/sessions.ts builds its request URLs as
 * `API_BASE_URL + path`, and a base that kept its slash would send `//api/...`
 * - a different path to the server.
 *
 * It is exported to be testable at all: vitest defines
 * VITE_COMVI_API_BASE_URL as a literal that has no trailing slash, so the
 * constant below can never exercise the normalization under test. The seam is
 * this function, not the constant.
 */
export function normalizeBaseUrl(raw: string): string {
  return raw.replace(/\/+$/, "");
}

export const API_BASE_URL = normalizeBaseUrl(RAW_API_BASE_URL);
