/**
 * @comvi/plugin-fetch-loader/cdn
 *
 * The CDN request path on its own. Same two ways in as the package root:
 * - `.with(cdnLoader(options))` — composes the loader and plugin capabilities,
 *   then registers the plugin. Start here.
 * - `.use(CdnLoader(options))` — the plugin factory, for a host that already
 *   has both capabilities.
 *
 * Use the root entry's `fetchLoader` instead when the app also reads the Comvi
 * API (`createI18n({ apiKey })`): this entry never builds an API URL, so an
 * `apiKey` on the host changes nothing here.
 */
export type { CdnLoaderOptions } from "./options";
export { CdnLoader } from "./loader";
export { cdnLoader } from "./installer";
export type { CdnLoaderInstaller } from "./installer";
