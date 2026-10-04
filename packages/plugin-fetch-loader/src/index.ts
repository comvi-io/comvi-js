/**
 * @comvi/plugin-fetch-loader
 *
 * Loads catalogs from the Comvi CDN. Two ways in, one lifecycle:
 * - `.use(cdnLoader(options))` — composes the loader and plugin capabilities,
 *   then registers the plugin. Start here.
 * - `registerPlugin(cdnLoaderPlugin(options))` — the plugin factory, for an i18n
 *   instance that already has both capabilities.
 *
 * Use `fetchLoader` from `@comvi/plugin-fetch-loader/api` instead when the app
 * also reads the Comvi API (`createI18n({ apiKey })`): this entry never builds
 * an API URL, so an `apiKey` on the i18n instance changes nothing here.
 */
export type { CdnLoaderOptions } from "./cdn/options";
export { cdnLoaderPlugin } from "./cdn/loader";
export { cdnLoader } from "./cdn/installer";
export type { CdnLoaderInstaller } from "./cdn/installer";
