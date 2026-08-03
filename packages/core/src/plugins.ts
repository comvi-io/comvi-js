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
// Compose `loader()` BEFORE `plugins()` when any hosted plugin registers a
// loader — plugins run at `init()`, and `registerLoader` has to exist by then.
// On a host that already has the capability — a second `.with(plugins())`, or
// the internal composite the CDN global ships — installing is a no-op.
import type { I18n } from "./core/i18n";
import type { I18nPluginHostApi } from "./types";
import { attachPlugins } from "./core/plugins";

export { attachPlugins } from "./core/plugins";
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
 * under the pipe's calling convention — it exists so every capability reads
 * the same way in a `.with` chain (and so options can arrive later without a
 * call-shape migration). `.with(attachPlugins)` is equally valid.
 *
 * Attaching is idempotent: a second `.with(plugins())`, or the internal
 * composite, installs nothing and keeps every registered plugin.
 */
export function plugins(): <T extends I18n<any>>(i18n: T) => T & I18nPluginHostApi {
  return attachPlugins;
}
