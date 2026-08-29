// The COMPOSED host this suite has always assumed.
//
// Since the single-entry convergence `@comvi/core` IS the base host, and
// `registerLocaleDetector` — the one host member this plugin needs — lives in
// `@comvi/core/plugins`. Only that capability is composed: the detector loads
// no catalog, so a loader would be a capability the subject never touches.
//
// The package's own `localeDetector()` installer performs this same attach and
// then calls `use`; it is the subject of `tests/installer.test.ts`, so this
// helper deliberately uses the low-level attach instead.
import { I18n as CoreI18n, type I18nOptions, type I18nPluginHostApi } from "@comvi/core";
import { attachPlugins } from "@comvi/core/plugins";

/** Base host + `@comvi/core/plugins`. */
export type ComposedHost = CoreI18n & I18nPluginHostApi;

/**
 * `new I18n(options)` with the plugin capability already composed on.
 * Constructing through a function that returns an object is what keeps the
 * `new` call sites in this suite untouched.
 */
export const I18n = function I18n(options: I18nOptions) {
  return attachPlugins(new CoreI18n(options));
} as unknown as new (options: I18nOptions) => ComposedHost;

export type I18n = ComposedHost;
