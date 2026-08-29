// @comvi/core/plugins — the plugin host, composed onto the base host.
//
// Pure subpath (never listed in package.json `sideEffects`): importing it has
// no effect until you compose an instance.
//
// ```ts
// import { createI18n } from "@comvi/core";
// import { loader } from "@comvi/core/loader";
// import { plugins } from "@comvi/core/plugins";
//
// const i18n = createI18n({ locale: "en" }).with(loader()).with(plugins());
// i18n.use(myPlugin);
// await i18n.init();
// ```
//
// Compose `loader()` as well when any hosted plugin registers a loader. The
// ORDER of `loader()`, `plugins()` and `devtools()` among themselves is free:
// plugins run at `init()`, by which point every capability composed before
// `init()` is attached.
//
// Two misuse guards live in this capability, so only apps that compose it pay
// for them. `ensureInstallable` is the nested-use guard a lowercase installer
// calls first, so `.use(fetchLoader(…))` fails before anything is attached.
// Independently, `init()` rejects a plugin that returns an OBJECT — only
// nothing and a cleanup function are legal, which catches an installer that
// hands the host back instead of registering a cleanup.
import type { I18n } from "./core/i18n";
import type { I18nPluginHostApi } from "./types";
import { attachPlugins } from "./core/plugins";

export { attachPlugins, ensureInstallable } from "./core/plugins";
export type { I18nPluginHostApi, I18nPluginHost } from "./types";
export type { I18nPlugin, I18nPluginFactory, PluginOptions } from "./plugins/types";

/**
 * The plugin host as a `.with(…)` installer.
 *
 * ```ts
 * const i18n = createI18n({ locale: "en" }).with(plugins());
 * i18n.use(FetchLoader({ baseUrl: "/locales" }));
 * ```
 *
 * The host takes no configuration today, so `plugins()` is `attachPlugins`
 * under the pipe's calling convention — it exists so every capability reads the
 * same way in a `.with` chain, and so options can arrive later without a
 * call-shape migration. `.with(attachPlugins)` is equally valid.
 *
 * Attaching is idempotent: a second `.with(plugins())`, or the internal
 * composite, installs nothing and keeps every registered plugin.
 */
export function plugins(): <T extends I18n<any>>(i18n: T) => T & I18nPluginHostApi {
  return attachPlugins;
}
