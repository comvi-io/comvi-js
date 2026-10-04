import type { I18nPlugin, I18nPluginFactory } from "@comvi/core";
import type { CdnLoaderOptions } from "./options";
import { FETCH_LOADER_PLUGIN_KEY } from "../plugin-key";
import { createCdnLoad, loadInitialFromCdn } from "../cdn-load";
import { trackInflight } from "../inflight";
import { ERROR_PREFIX } from "../http-core";

/**
 * Loads translations from a CDN — and only from a CDN.
 *
 * This is the CDN branch of `fetchLoaderPlugin` as a plugin of its own. `fetchLoaderPlugin`
 * chooses between the CDN and the API at RUNTIME (`if (i18n.apiKey)`), so an app
 * that only ever reads a public distribution still ships the whole API request
 * path: the project-info cache, the legacy export chain and the retry policy.
 * Here that path is not in the module graph at all, which is the entire point of
 * the subpath.
 *
 * The CDN behaviour itself is not reimplemented — `createCdnLoad` is the same
 * request path `fetchLoaderPlugin` runs, so the two cannot drift.
 *
 * @example
 * ```typescript
 * import { createI18n } from '@comvi/core';
 * import { attachLoader } from '@comvi/core/loader';
 * import { plugins } from '@comvi/core/plugins';
 * import { cdnLoaderPlugin } from '@comvi/plugin-fetch-loader';
 *
 * const i18n = createI18n({ locale: 'en' }).use(attachLoader).use(plugins());
 *
 * i18n.registerPlugin(cdnLoaderPlugin({ cdnUrl: 'https://cdn.comvi.io/51db17c3d52f4e7eba810b7bb9b6576b' }));
 *
 * await i18n.init();
 * ```
 */
export const cdnLoaderPlugin: I18nPluginFactory<CdnLoaderOptions> = (options): I18nPlugin => {
  if (!options?.cdnUrl) throw new Error(`${ERROR_PREFIX} cdnUrl is required`);

  const { cdnUrl, fallback, timeout = 10000, loadOnInit = true, cdnLayout, cache } = options;

  return async (i18n) => {
    i18n.setPluginData(FETCH_LOADER_PLUGIN_KEY, options);

    const defaultNs = i18n.getDefaultNamespace();
    const requests = trackInflight(i18n, options);
    const cdn = createCdnLoad({ cdnUrl, defaultNs, timeout, cdnLayout, fallback, cache }, requests);

    i18n.registerLoader(cdn.load);

    // During i18n.init(), core loads initial namespaces after every plugin has
    // registered its hooks. Loading here would emit namespaceLoaded too early
    // for later plugins such as the in-context editor.
    if (loadOnInit && !i18n.isInitializing) {
      await loadInitialFromCdn(i18n, defaultNs, cdn.load);
    }

    return () => {
      requests.stop();
      cdn.clear();
    };
  };
};
