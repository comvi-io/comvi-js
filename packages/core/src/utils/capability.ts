// Capability presence: the shared, loud boundary between a wrapper and the
// host instance it was handed (framework-slim §2.4).
//
// A bare `@comvi/core` instance is a `WrapperI18nHost` and nothing more:
// the loader and plugin-host APIs are absent from its module graph, not
// merely disabled. Wrappers therefore verify capability presence ONCE, at the
// acquisition call (`useI18nLoader()` / `useI18nPlugins()`), and throw the
// error this module builds — in dev AND in prod. There is no silent no-op and
// no dev-only tombstone.
//
// The checks are STRUCTURAL and read PUBLIC names only. `_`-prefixed
// internals are renamed by the shared terser nameCache
// (`vite.shared.ts#mangleInternalProps`), so probing them from a wrapper
// bundle would break silently in prod; public method names are never
// mangled, which makes these guards mangling-immune by construction.
//
// This module is pure: nothing here runs at import time, so a wrapper that
// imports only `subscribeToRevision` from the root pays zero bytes for it.
import type {
  DefaultTranslationParams,
  I18nLoaderApi,
  I18nPluginHostApi,
  WrapperI18nHost,
} from "../types";

declare const __DEV__: boolean | undefined;
const IS_DEV = typeof __DEV__ !== "undefined" && __DEV__;

/** The capability subpaths a host can be composed with. */
export type CapabilityName = "loader" | "plugins";

/**
 * Every public member of `I18nLoaderApi`. Attach is all-or-nothing, so a host
 * that carries all of them carries the whole bag.
 */
const LOADER_MEMBERS: readonly (keyof I18nLoaderApi)[] = [
  "registerLoader",
  "getLoader",
  "reloadTranslations",
  "addActiveNamespace",
  "addActiveNamespaces",
  "onLoadError",
];

/** Every public member of `I18nPluginHostApi`. */
const PLUGIN_MEMBERS: readonly (keyof I18nPluginHostApi)[] = [
  "use",
  "registerLocaleDetector",
  "getLanguageDetector",
  "onMissingKey",
  "registerPostProcessor",
  "setPluginData",
  "getPluginData",
];

/**
 * The error every wrapper throws when a capability was requested from a host
 * that does not have it. One factory, one wording, four wrappers.
 *
 * @example
 * ```ts
 * if (!hasLoaderApi(host)) throw missingCapability("loader");
 * ```
 */
export function missingCapability(name: CapabilityName): Error {
  return new Error(
    IS_DEV
      ? `[comvi] This i18n instance has no ${name} capability. Compose it: .with(${name}()) from "@comvi/core/${name}", or the lower-level attach${
          name === "loader" ? "Loader" : "Plugins"
        }.`
      : `[comvi] missing ${name} capability — attach @comvi/core/${name}`,
  );
}

/** Whether `host` carries the whole `@comvi/core/loader` surface. */
export function hasLoaderApi<D extends DefaultTranslationParams = {}>(
  host: WrapperI18nHost<D>,
): host is WrapperI18nHost<D> & I18nLoaderApi {
  const probe = host as unknown as Record<string, unknown>;
  return LOADER_MEMBERS.every((name) => typeof probe[name] === "function");
}

/** Whether `host` carries the whole `@comvi/core/plugins` surface. */
export function hasPluginHostApi<D extends DefaultTranslationParams = {}>(
  host: WrapperI18nHost<D>,
): host is WrapperI18nHost<D> & I18nPluginHostApi {
  const probe = host as unknown as Record<string, unknown>;
  return PLUGIN_MEMBERS.every((name) => typeof probe[name] === "function");
}
