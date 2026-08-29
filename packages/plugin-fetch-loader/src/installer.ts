// The `.with(…)` installer half of this package.
//
// ```ts
// import { createI18n } from "@comvi/core";
// import { fetchLoader } from "@comvi/plugin-fetch-loader";
//
// const i18n = createI18n({ locale: "en" }).with(
//   fetchLoader({ cdnUrl: "https://cdn.comvi.io/your-distribution-id" }),
// );
// await i18n.init();
// ```
//
// `fetchLoader` (lowercase) is an INSTALLER: it ensures the two core
// capabilities the plugin needs and then routes into the host's own `use`.
// `FetchLoader` (uppercase) is the PLUGIN factory and is unchanged — on a host
// that already has `@comvi/core/loader` and `@comvi/core/plugins` composed,
// `.use(FetchLoader(…))` behaves exactly as it always has.
//
// The lifecycle is NOT re-implemented here. `required`, `timeout`, `onError`,
// the cleanup registration and LIFO destroy all keep running inside
// `I18nPluginHost`, because the last thing this installer does is call `use`.
import type { I18n, I18nLoaderApi, I18nPluginHostApi } from "@comvi/core";
import { attachLoader } from "@comvi/core/loader";
import { attachPlugins, ensureInstallable } from "@comvi/core/plugins";
import type { FetchLoaderOptions } from "./options";
import { FetchLoader } from "./loader";

/** The host surface `fetchLoader` guarantees on the way out. */
export type FetchLoaderInstaller = <T extends I18n<any>>(
  i18n: T,
) => T & I18nLoaderApi & I18nPluginHostApi;

/**
 * The fetch loader as a `.with(…)` installer.
 *
 * ```ts
 * const i18n = createI18n({ locale: "en" }).with(fetchLoader({ cdnUrl }));
 * ```
 *
 * Composes `@comvi/core/loader` and `@comvi/core/plugins` — in that order,
 * because the plugin calls `registerLoader` at `init()` — and then registers
 * `FetchLoader(options)` through the host's `use`. Both attaches are
 * idempotent, so composing onto a host that already has either capability
 * installs nothing and keeps everything already registered.
 *
 * Widening is exact: the returned host carries the loader API and the plugin
 * host API, which is precisely what the two attaches added.
 *
 * `options` is required here even though `FetchLoader(options?)` accepts
 * `undefined`: `cdnUrl` has no default, and the uppercase factory throws
 * `[FetchLoader] cdnUrl is required` either way. That throw stays at
 * COMPOSITION time — this installer builds the plugin before it queues it.
 *
 * WRONG USE. `.use(fetchLoader(…))` is a type error, and at runtime it fails
 * at `init()` on the first ensure-step (`ensureInstallable`) with an
 * actionable message, before the loader or plugin capability is attached and
 * before a second plugin reaches the queue.
 */
export function fetchLoader(options: FetchLoaderOptions): FetchLoaderInstaller {
  return (i18n) => {
    const host = attachPlugins(attachLoader(ensureInstallable(i18n, "fetchLoader")));
    host.use(FetchLoader(options));
    return host;
  };
}
