/**
 * @comvi/plugin-fetch-loader/api
 *
 * The CDN and Comvi API request paths, switched at runtime on the i18n
 * instance's `apiKey`, plus the HTTP helpers the in-context editor reuses.
 * Two ways in, one lifecycle:
 * - `.use(fetchLoader(options))` — composes the loader and plugin
 *   capabilities, then registers the plugin. Start here.
 * - `registerPlugin(fetchLoaderPlugin(options))` — the plugin factory, for an
 *   i18n instance that already has both capabilities.
 *
 * A CDN-only app imports `cdnLoader` from the package root and never bundles
 * the API path.
 */
export type {
  CdnLayoutOptions,
  FallbackImport,
  FallbackMap,
  FetchLoaderOptions,
  ProjectInfo,
} from "./options";
export {
  API_BASE_URL,
  FETCH_LOADER_PLUGIN_KEY,
  comviPreset,
  getFetchLoaderConfig,
} from "./options";
export type { FetchRequestOptions } from "./http";
export {
  buildApiExportUrl,
  buildApiTranslationsUrl,
  buildCdnUrl,
  transformApiResponse,
} from "./http";
export { clearProjectInfoCache, fetchApiTranslations, fetchProjectInfo } from "./cache";
export { fetchLoaderPlugin, resolveFallback } from "./loader";
export { fetchLoader } from "./installer";
export type { FetchLoaderInstaller } from "./installer";
export type { ExportApiResponse, TranslationStore } from "./types";
