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

export const API_BASE_URL = RAW_API_BASE_URL.replace(/\/+$/, "");
