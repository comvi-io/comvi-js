import type { I18n, I18nLoaderApi, I18nPluginHostApi } from "@comvi/core";
import { attachLoader } from "@comvi/core/loader";
import { attachPlugins, ensureInstallable } from "@comvi/core/plugins";
import type { CdnLoaderOptions } from "./options";
import { cdnLoaderPlugin } from "./loader";

/** The instance surface `cdnLoader` guarantees on the way out. */
export type CdnLoaderInstaller = <T extends I18n<any>>(
  i18n: T,
) => T & I18nLoaderApi & I18nPluginHostApi;

/**
 * The CDN-only fetch loader as a `.use(…)` installer.
 *
 * ```ts
 * const i18n = createI18n({ locale: "en" }).use(cdnLoader({ cdnUrl }));
 * ```
 *
 * The same composition `fetchLoader` performs — `@comvi/core/plugins` and
 * `@comvi/core/loader`, both idempotent, then `registerPlugin`, with `attachPlugins`
 * first so a late compose reports the plugin queue rather than the loader's
 * unreachable recovery advice — around `cdnLoaderPlugin(options)` instead of
 * `fetchLoaderPlugin(options)`. Reach for
 * `fetchLoader` from `@comvi/plugin-fetch-loader/api` when the app also talks to
 * the Comvi API (`createI18n({ apiKey })`); this entry has no API request path
 * at all.
 *
 * `options` is required here even though `cdnLoaderPlugin(options?)` accepts
 * `undefined`: `cdnUrl` has no default, and the throw stays at COMPOSITION
 * time — this installer builds the plugin before it queues it.
 *
 * `registerPlugin(cdnLoader(…))` is a type error, and at runtime fails at `init()` on
 * `ensureInstallable` before either capability is attached. Hand the
 * `cdnLoaderPlugin` factory to `registerPlugin` instead.
 */
export function cdnLoader(options: CdnLoaderOptions): CdnLoaderInstaller {
  return (i18n) => {
    const host = attachLoader(attachPlugins(ensureInstallable(i18n, "cdnLoader")));
    host.registerPlugin(cdnLoaderPlugin(options));
    return host;
  };
}
