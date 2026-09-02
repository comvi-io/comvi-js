// `@comvi/core`'s root is the bare base host, so these suites opt into both
// capabilities they exercise: `@comvi/core/plugins` for post-processors and
// `@comvi/core/devtools` for the standalone runtime's `window.__COMVI__`
// discovery. The low-level attaches are deliberate — `inContextEditor()` is
// the subject of `tests/installer.test.ts`, not a tool for these suites.
import { createI18n as createBaseI18n } from "@comvi/core";
import type {
  I18n,
  I18nLoaderApi,
  I18nOptions,
  I18nPluginHost,
  I18nPluginHostApi,
} from "@comvi/core";
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

/**
 * `I18nPlugin` declares the fully composed plugin host, loader capability
 * included, because a plugin is allowed to call loader APIs. The editor
 * runtime calls none of them, so these suites deliberately leave that
 * capability off the double; handing it to a plugin states the unused half
 * here rather than at every install site.
 */
export function asPluginHost(i18n: ComposedHost): I18nPluginHost {
  return i18n as ComposedHost & I18nLoaderApi;
}
