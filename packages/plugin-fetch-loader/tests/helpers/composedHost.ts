// The composed host these suites assume. `@comvi/core`'s root is the bare base
// host; `FetchLoader` needs `registerLoader` (`@comvi/core/loader`) and
// `setPluginData` (`@comvi/core/plugins`), so hosts are constructed here rather
// than with `new I18n(…)` from the root.
//
// The low-level attach is deliberate: `fetchLoader()` performs exactly these
// two attaches and then calls `use`, and it is itself the subject of
// `tests/installer.test.ts` — using it here would test the installer instead
// of the plugin.
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
 * `new I18n(options)` with both capabilities already composed on. A function
 * returning an object is what keeps this suite's `new` call sites untouched.
 */
export const I18n = function I18n(options: I18nOptions) {
  return attachPlugins(attachLoader(new CoreI18n(options)));
} as unknown as new (options: I18nOptions) => ComposedHost;

export type I18n = ComposedHost;
