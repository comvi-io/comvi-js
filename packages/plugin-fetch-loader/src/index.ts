/**
 * @comvi/plugin-fetch-loader
 *
 * Public entry point. Implementation lives in cohesive modules:
 * - `options.ts`   — option types, plugin-data access, base-URL presets
 * - `http.ts`      — fetch primitives, URL building, response transforms
 * - `cache.ts`     — project-info cache and API translation fetching
 * - `loader.ts`    — fallback resolution and the FetchLoader plugin shell
 * - `installer.ts` — the lowercase `.with(…)` installer over that plugin
 *
 * TWO WAYS IN, one lifecycle:
 * - `.with(fetchLoader(options))` — composes the loader and plugin
 *   capabilities, then registers the plugin. Start here.
 * - `.use(FetchLoader(options))` — the plugin factory, for a host that
 *   already has both capabilities. Unchanged.
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
  CDN_BASE_URL,
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
export { FetchLoader, resolveFallback } from "./loader";
export { fetchLoader } from "./installer";
export type { FetchLoaderInstaller } from "./installer";
export type { ExportApiResponse, TranslationStore } from "./types";
