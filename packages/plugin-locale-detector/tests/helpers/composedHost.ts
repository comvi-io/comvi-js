// The composed host this suite assumes: base `@comvi/core` plus the plugin
// capability from `@comvi/core/plugins`, where `registerLocaleDetector` lives.
// No loader is composed — the detector never loads a catalog.
//
// The package's own `localeDetector()` installer performs this same attach and
// is itself the subject of `tests/installer.test.ts`, so this helper
// deliberately uses the low-level attach instead.
import { I18n as CoreI18n, type I18nOptions, type I18nPluginHostApi } from "@comvi/core";
import { attachPlugins } from "@comvi/core/plugins";

/** Base host + `@comvi/core/plugins`. */
export type ComposedHost = CoreI18n & I18nPluginHostApi;

/**
 * `new I18n(options)` with the plugin capability already composed on.
 * A function returning an object is what keeps this suite's `new` call sites
 * untouched.
 */
export const I18n = function I18n(options: I18nOptions) {
  return attachPlugins(new CoreI18n(options));
} as unknown as new (options: I18nOptions) => ComposedHost;

export type I18n = ComposedHost;
