// The COMPOSED host these suites have always assumed.
//
// Since the single-entry convergence `@comvi/core` IS the base host, these
// editor suites must opt into both capabilities they exercise:
// `@comvi/core/plugins` for post-processors and `@comvi/core/devtools` for the
// standalone runtime's `window.__COMVI__` discovery. The package's own
// `inContextEditor()` installer remains the subject of `tests/installer.test.ts`,
// so this helper stays on the low-level attaches.
import { createI18n as createBaseI18n } from "@comvi/core";
import type { I18n, I18nOptions, I18nPluginHostApi } from "@comvi/core";
import { attachPlugins } from "@comvi/core/plugins";
import { attachDevtools } from "@comvi/core/devtools";

/** Base host + the plugin API + browser discovery used by editor tests. */
export type ComposedHost = I18n & I18nPluginHostApi;

/** `createI18n(options)` with the plugin capability already composed on. */
export function createI18n(options: I18nOptions): ComposedHost {
  return attachDevtools(attachPlugins(createBaseI18n(options)), {
    instanceId: options.instanceId,
    exposeGlobal: options.exposeGlobal,
  });
}
