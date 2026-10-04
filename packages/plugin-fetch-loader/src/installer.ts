import type { I18n, I18nLoaderApi, I18nPluginHostApi } from "@comvi/core";
import { attachLoader } from "@comvi/core/loader";
import { attachPlugins, ensureInstallable } from "@comvi/core/plugins";
import type { FetchLoaderOptions } from "./options";
import { fetchLoaderPlugin } from "./loader";

/** The host surface `fetchLoader` guarantees on the way out. */
export type FetchLoaderInstaller = <T extends I18n<any>>(
  i18n: T,
) => T & I18nLoaderApi & I18nPluginHostApi;

/**
 * The fetch loader as a `.use(…)` installer.
 *
 * ```ts
 * const i18n = createI18n({ locale: "en" }).use(fetchLoader({ cdnUrl }));
 * ```
 *
 * Composes `@comvi/core/plugins` and `@comvi/core/loader` and then registers
 * `fetchLoaderPlugin(options)` through the host's `use`. Both attaches are
 * idempotent, so composing onto a host that already has either capability
 * installs nothing and keeps everything already registered.
 *
 * The attach order does not change the resulting host — the plugin calls
 * `registerLoader` at `init()`, by which point both are attached, and a later
 * `attachLoader` overwrites `attachPlugins`' dev loader shims cleanly. It does
 * decide the DIAGNOSTIC on a late compose: the late-compose warning fires once
 * per host, and only the plugin capability's message is true here. A late
 * `.use(fetchLoader(…))` does not run the plugin, so no loader is
 * registered and the loader message's recovery advice — `reloadMessages()`
 * (which throws `E_NO_LOADER_REGISTERED`) or `addActiveNamespace()` (which
 * fetches nothing) — cannot work. `attachPlugins` therefore runs FIRST so its
 * message claims the slot.
 *
 * `required`, `timeout`, `onError`, cleanup registration and LIFO destroy are
 * not re-implemented here; they keep running inside `I18nPluginHost`, because
 * the last thing this installer does is call `registerPlugin`.
 *
 * `options` is required here even though `fetchLoaderPlugin(options?)` accepts
 * `undefined`: `cdnUrl` has no default, and the throw stays at COMPOSITION
 * time — this installer builds the plugin before it queues it.
 *
 * `registerPlugin(fetchLoader(…))` is a type error, and at runtime fails at `init()` on
 * `ensureInstallable` before either capability is attached. Hand the
 * `fetchLoaderPlugin` factory to `registerPlugin` instead.
 */
export function fetchLoader(options: FetchLoaderOptions): FetchLoaderInstaller {
  return (i18n) => {
    const host = attachLoader(attachPlugins(ensureInstallable(i18n, "fetchLoader")));
    host.registerPlugin(fetchLoaderPlugin(options));
    return host;
  };
}
