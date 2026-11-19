/**
 * The two values of 0.7's `@comvi/plugin-fetch-loader/src/options.ts` the API request path
 * reads. The editor carried them over in lot 2c, when that package left the monorepo
 * (R3-11); lot 8 replaces this directory with the protocol-2 editor's own loading.
 */

/** Project metadata from `GET /v1/project`. */
export interface ProjectInfo {
  id: number;
  organizationId: number;
  name: string;
  description: string | null;
  sourceLocale: string;
}

/** The platform's public endpoints. */
export const comviPreset = {
  apiBaseUrl: "https://api.comvi.io",
  cdnBaseUrl: "https://cdn.comvi.io",
} as const;

/**
 * API base URL when no base is passed. `NEXT_PUBLIC_COMVI_API_URL` is read from
 * `process.env` on the server; where `process` does not exist (a browser, an edge runtime)
 * this is the preset.
 */
export const API_BASE_URL =
  (typeof process !== "undefined" && process.env?.NEXT_PUBLIC_COMVI_API_URL) ||
  comviPreset.apiBaseUrl;
