/**
 * The Comvi API request path the editor reads translations through: a copy of 0.7's
 * `@comvi/plugin-fetch-loader/api` (`fetchApiTranslations`, `clearProjectInfoCache`), moved
 * here in lot 2c when that package left the monorepo (R3-11). Lot 8 (protocol 2) replaces
 * it with the editor's own loading.
 */
export { clearProjectInfoCache, fetchApiTranslations, fetchProjectInfo } from "./cache";
export type { ExportApiResponse, TranslationStore } from "./types";
