// @comvi/core/plugins — the plugin host, composed onto the base host.
//
// Pure subpath (never listed in package.json `sideEffects`): importing it has
// no effect until you compose an instance.
//
// ```ts
// import { createI18n } from "@comvi/core";
// import { loader } from "@comvi/core/loader";
// import { definePlugin, plugins } from "@comvi/core/plugins";
//
// const i18n = createI18n({ locale: "en" })
//   .use(loader())
//   .use(plugins())
//   .use(definePlugin(myPlugin));
// await i18n.init();
// ```
//
// Compose `loader()` as well when any hosted plugin registers a loader. The
// ORDER of `loader()`, `plugins()` and `devtools()` among themselves is free:
// plugins run at `init()`, by which point every capability composed before
// `init()` is attached.
//
// Two misuse guards live in this capability, so only apps that compose it pay
// for them. `ensureInstallable` is the installer-as-plugin guard a lowercase
// installer calls first, so `registerPlugin(fetchLoader(…))` fails before
// anything is attached. Independently, `init()` rejects a plugin that returns
// an OBJECT — only nothing and a cleanup function are legal, which catches an
// installer that hands the host back instead of registering a cleanup.
import type { I18n } from "./core/i18n";
import type { I18nPluginHostApi } from "./types";
import { attachPlugins } from "./core/plugins";
import type { I18nPlugin as I18nPluginFn, PluginOptions } from "./plugins/types";

export { attachPlugins, ensureInstallable } from "./core/plugins";
export type { I18nPluginHostApi, I18nPluginHost } from "./types";
export type { I18nPlugin, I18nPluginFactory, PluginOptions } from "./plugins/types";

/**
 * The plugin host as a `.use(…)` installer.
 *
 * ```ts
 * const i18n = createI18n({ locale: "en" }).use(plugins());
 * i18n.registerPlugin(myPlugin);
 * ```
 *
 * The host takes no configuration today, so `plugins()` is `attachPlugins`
 * under the pipe's calling convention — it exists so every capability reads the
 * same way in a `.use` chain, and so options can arrive later without a
 * call-shape migration. `.use(attachPlugins)` is equally valid.
 *
 * Attaching is idempotent: a second `.use(plugins())`, or the internal
 * composite, installs nothing and keeps every registered plugin.
 */
export function plugins(): <T extends I18n<any>>(i18n: T) => T & I18nPluginHostApi {
  return attachPlugins;
}

/**
 * Register your OWN inline plugin through the one composition verb.
 *
 * ```ts
 * const i18n = createI18n({ locale: "en" }).use(
 *   definePlugin((i18n) => {
 *     const off = i18n.on("localeChanged", track);
 *     return off; // optional cleanup
 *   }),
 * );
 * ```
 *
 * `definePlugin(fn)` is `attachPlugins(host).registerPlugin(fn)` wrapped as an
 * installer, so it attaches the plugin host if the chain has not already, and
 * it can appear anywhere in a `.use` chain before `init()`. A plugin PACKAGE
 * ships its own lowercase installer (`fetchLoader()`, `localeDetector()`) —
 * those go straight into `.use(…)` and must NOT be wrapped here.
 */
export function definePlugin(
  fn: I18nPluginFn,
  options?: PluginOptions,
): <T extends I18n<any>>(host: T) => T & I18nPluginHostApi {
  return (host) => {
    attachPlugins(host).registerPlugin(fn, options);
    return host as typeof host & I18nPluginHostApi;
  };
}
