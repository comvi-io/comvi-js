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
 * Composes `@comvi/core/loader` and `@comvi/core/plugins` — the order between
 * them does not matter, because the plugin calls `registerLoader` at `init()`,
 * by which point both are attached — and then registers
 * `FetchLoader(options)` through the host's `use`. Both attaches are
 * idempotent, so composing onto a host that already has either capability
 * installs nothing and keeps everything already registered.
 *
 * `required`, `timeout`, `onError`, cleanup registration and LIFO destroy are
 * not re-implemented here; they keep running inside `I18nPluginHost`, because
 * the last thing this installer does is call `use`.
 *
 * `options` is required here even though `FetchLoader(options?)` accepts
 * `undefined`: `cdnUrl` has no default, and the throw stays at COMPOSITION
 * time — this installer builds the plugin before it queues it.
 *
 * `.use(fetchLoader(…))` is a type error, and at runtime fails at `init()` on
 * `ensureInstallable` before either capability is attached. Hand the uppercase
 * `FetchLoader` factory to `.use` instead.
 */
export function fetchLoader(options: FetchLoaderOptions): FetchLoaderInstaller {
  return (i18n) => {
    const host = attachPlugins(attachLoader(ensureInstallable(i18n, "fetchLoader")));
    host.use(FetchLoader(options));
    return host;
  };
}
