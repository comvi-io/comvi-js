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
//   .use(loader({ uk: () => import("./uk.json") }))
//   .use(plugins())
//   .use(definePlugin(myPlugin));
// await i18n.init();
// ```
//
// Compose the loader capability as well when any hosted plugin registers a
// loader. The ORDER of `loader(map)`, `plugins()` and `devtools()` among
// themselves is free:
// plugins run at `init()`, by which point every capability composed before
// `init()` is attached.
//
// `acquirePluginsApi(host)` is the COMPONENT-side half of the same subpath: the
// one implementation behind `useI18nPlugins()` in all four bindings. It lives
// here rather than on the `@comvi/core` root because a graph that never
// acquires the capability must not pay for it — the root is the base floor.
//
// Two misuse guards live in this capability, so only apps that compose it pay
// for them. `ensureInstallable` is the installer-as-plugin guard an
// installer calls first, so `registerPlugin(fetchLoader(…))` fails before
// anything is attached. Independently, `init()` rejects a plugin that returns
// an OBJECT — only nothing and a cleanup function are legal, which catches an
// installer that hands the host back instead of registering a cleanup.
import type { I18n } from "./core/i18n";
import type { I18nPluginHostApi, WrapperI18nHost } from "./types";
import { attachPlugins } from "./core/plugins";
import type { I18nPlugin as I18nPluginFn, PluginOptions } from "./plugins/types";
import { hasPluginHostApi, missingCapability } from "./utils/capability";

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
 * ships its own bare-name installer (`fetchLoader()`, `localeDetector()`) —
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

/**
 * The `@comvi/core/plugins` surface a COMPONENT may drive.
 *
 * `registerPlugin` / `registerPostProcessor` / `registerLocaleDetector` are
 * deliberately absent for the same reason as the loader's registration APIs:
 * wiring belongs where the instance is constructed.
 *
 * Re-exported by `@comvi/react`, `@comvi/vue`, `@comvi/solid` and
 * `@comvi/svelte` as `UseI18nPluginsReturn`: it is the return of their
 * `useI18nPlugins()`, which is {@link acquirePluginsApi} over the host in
 * context.
 */
export interface AcquiredPluginsApi {
  /**
   * Register a callback for missing keys. Returns an unsubscribe function.
   *
   * The member is the bound host method — nothing wraps it, so a callback may
   * return the full `TranslationResult` core accepts: a string, or the
   * `Array<string | VirtualNode>` a rich-text fallback needs. Core runs every
   * callback and the first defined result wins. A wrapper-side coercion would
   * narrow that contract to a semantic core does not have, and one binding's
   * `String(result)` once did exactly that.
   */
  onMissingKey: I18nPluginHostApi["onMissingKey"];
}

/**
 * Identity contract: ONE bag per host, cached here rather than in a
 * framework-local memo, so two components under one app receive the same
 * function references.
 *
 * Annotated pure so a graph that never acquires the capability does not pay
 * for the map: `acquirePluginsApi` is the only reader, and dropping the
 * function has to drop this with it.
 */
const pluginBags = /* @__PURE__ */ new WeakMap<WrapperI18nHost, AcquiredPluginsApi>();

/**
 * Acquire the plugin-host capability of `host`, or throw
 * {@link missingCapability | missingCapability("plugins")}.
 *
 * ONE implementation, four bindings: `useI18nPlugins()` in `@comvi/react`,
 * `@comvi/vue`, `@comvi/solid` and `@comvi/svelte` is this call over the host
 * each of them reads from context, and nothing else.
 *
 * The check is STRUCTURAL and it throws in dev AND in prod: there is no silent
 * no-op and no dev-only tombstone. A bare `@comvi/core` instance has no plugin
 * host, so compose it where the instance is created — `.use(plugins())`.
 *
 * @example
 * ```ts
 * const { onMissingKey } = acquirePluginsApi(host);
 * const off = onMissingKey((key) => `[${key}]`);
 * ```
 */
export function acquirePluginsApi(host: WrapperI18nHost): AcquiredPluginsApi {
  // A cached bag implies the capability was already verified for this host:
  // attach is monotonic, capabilities are added and never removed.
  const cached = pluginBags.get(host);
  if (cached) return cached;

  if (!hasPluginHostApi(host)) throw missingCapability("plugins");

  const bag: AcquiredPluginsApi = {
    onMissingKey: host.onMissingKey.bind(host),
  };
  pluginBags.set(host, bag);
  return bag;
}
