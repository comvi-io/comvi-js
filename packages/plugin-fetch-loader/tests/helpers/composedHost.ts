// The COMPOSED host these suites have always assumed.
//
// Since the single-entry convergence `@comvi/core` IS the base host: no
// loader, no plugin host, no devtools. `FetchLoader` needs `registerLoader`
// (`@comvi/core/loader`) and `setPluginData` (`@comvi/core/plugins`), so the
// suites that predate the convergence construct their host through here
// instead of `new I18n(…)` from the root.
//
// This is the LOW-LEVEL composition on purpose. `fetchLoader()` — the
// package's own installer, which performs exactly these two attaches and then
// calls `use` — is the subject of `tests/installer.test.ts`, and a helper that
// used it would make those suites test the installer instead of the plugin.
import {
  I18n as CoreI18n,
  type I18nLoaderApi,
  type I18nOptions,
  type I18nPluginHostApi,
} from "@comvi/core";
import { attachLoader } from "@comvi/core/loader";
import { attachPlugins } from "@comvi/core/plugins";

/** Base host + `@comvi/core/loader` + `@comvi/core/plugins`. */
export type ComposedHost = CoreI18n & I18nLoaderApi & I18nPluginHostApi;

/**
 * `new I18n(options)` with both capabilities already composed on. Constructing
 * through a function that returns an object is what keeps the `new` call sites
 * in these suites untouched.
 */
export const I18n = function I18n(options: I18nOptions) {
  return attachPlugins(attachLoader(new CoreI18n(options)));
} as unknown as new (options: I18nOptions) => ComposedHost;

export type I18n = ComposedHost;
