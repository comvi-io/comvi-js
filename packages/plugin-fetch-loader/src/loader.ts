import type { I18nPlugin, I18nPluginFactory, TranslationValue } from "@comvi/core";
import type { TranslationStore } from "./types";
import type { FetchLoaderOptions } from "./options";
import { FETCH_LOADER_PLUGIN_KEY } from "./plugin-key";
import {
  ERROR_PREFIX,
  RequestAbortedError,
  buildCacheOptions,
  isAborted,
  toError,
} from "./http-core";
import { tryFallback } from "./fallback";
import { trackInflight } from "./inflight";
import { createCdnLoad, loadInitialFromCdn } from "./cdn-load";
import { fetchApiTranslations } from "./cache";

export { resolveFallback } from "./fallback";

/**
 * Loads translations from Comvi's backend API in development mode and from the
 * CDN in production mode.
 *
 * @example
 * ```typescript
 * import { createI18n } from '@comvi/core';
 * import { attachLoader } from '@comvi/core/loader';
 * import { plugins } from '@comvi/core/plugins';
 * import { fetchLoaderPlugin } from '@comvi/plugin-fetch-loader/api';
 *
 * // The plugin factory needs a host with both capabilities composed;
 * // `.use(fetchLoader(options))` does this composition for you.
 * const i18n = createI18n({ locale: 'en', apiKey: 'your-api-key' })
 *   .use(attachLoader)
 *   .use(plugins());
 *
 * i18n.registerPlugin(fetchLoaderPlugin({
 *   cdnUrl: 'https://cdn.comvi.io/51db17c3d52f4e7eba810b7bb9b6576b',
 *   fallback: {
 *     'en': () => import('./locales/en.json'),
 *   },
 *   onLoadError: (locale, ns, error) => console.error('Load failed:', error)
 * }));
 *
 * await i18n.init();
 * ```
 */
export const fetchLoaderPlugin: I18nPluginFactory<FetchLoaderOptions> = (options): I18nPlugin => {
  if (!options?.cdnUrl) throw new Error(`${ERROR_PREFIX} cdnUrl is required`);

  const {
    cdnUrl,
    baseUrl: apiBaseUrl,
    fallback,
    timeout = 10000,
    retry,
    loadOnInit = true,
    cdnLayout,
    cache,
  } = options;

  // When `baseUrl` is absent, downstream URL builders fall back to the
  // build-time env override / Comvi platform preset (API_BASE_URL).

  const cacheOpts = buildCacheOptions(cache);

  return async (i18n) => {
    i18n.setPluginData(FETCH_LOADER_PLUGIN_KEY, options);

    const defaultNs = i18n.getDefaultNamespace();
    const apiKey = i18n.apiKey;
    // During i18n.init(), core loads initial namespaces after every plugin has
    // registered its hooks. Loading here would emit namespaceLoaded too early
    // for later plugins such as the in-context editor.
    const shouldLoadImmediately = loadOnInit && !i18n.isInitializing;

    const requests = trackInflight(i18n, options);
    const { track: trackRequest, generation, isStopped, reportSuccess, reportError } = requests;

    if (apiKey) {
      // Keyed by locale + namespace set, so loads of other namespaces in the
      // same batch keep sharing one request; each entry also remembers its
      // invalidation generation, so a load after a reload or clear starts a
      // new request instead of joining the abandoned one.
      const pending = new Map<
        string,
        [number, Promise<{ store: TranslationStore; attemptedFallbacks: Set<string> }>]
      >();

      const fetchFromApi = async (
        locale: string,
        namespaces: string[],
      ): Promise<{ store: TranslationStore; attemptedFallbacks: Set<string> }> => {
        const requestedNamespaces = [...new Set(namespaces)];
        const key = `${locale}:${[...requestedNamespaces].sort().join(",")}`;
        const gen = generation();
        const existing = pending.get(key);
        if (existing?.[0] === gen) return existing[1];

        let promise!: Promise<{ store: TranslationStore; attemptedFallbacks: Set<string> }>;
        // eslint-disable-next-line prefer-const -- the finally compares against it
        promise = (async () => {
          const store: TranslationStore = new Map();
          const attemptedFallbacks = new Set<string>();
          const { signal, release } = trackRequest(locale, requestedNamespaces);
          try {
            for (const [k, v] of await fetchApiTranslations(
              apiKey,
              locale,
              requestedNamespaces,
              apiBaseUrl,
              timeout,
              undefined,
              undefined,
              { signal, retry, ...cacheOpts },
            ))
              store.set(k, v);
            if (signal.aborted || isStopped()) throw new RequestAbortedError("API translations");
            for (const ns of requestedNamespaces) {
              if (store.has(`${locale}:${ns}`)) reportSuccess(locale, ns);
            }
          } catch (error) {
            if (signal.aborted || isStopped() || isAborted(error)) {
              throw new RequestAbortedError("API translations");
            }
            const err = toError(error);
            for (const ns of requestedNamespaces) {
              const ck = `${locale}:${ns}`;
              if (!store.has(ck)) {
                const fallbackResult = await tryFallback(
                  fallback,
                  locale,
                  ns,
                  defaultNs,
                  reportSuccess,
                  reportError,
                );
                if (signal.aborted || isStopped()) {
                  throw new RequestAbortedError("API translation fallback");
                }
                if (fallbackResult.attempted) attemptedFallbacks.add(ck);
                if (fallbackResult.data) {
                  store.set(ck, fallbackResult.data as Record<string, string>);
                } else if (!fallbackResult.attempted) {
                  reportError(locale, ns, err);
                }
              }
            }
          } finally {
            release();
            // Only this request's own entry: a newer one may have replaced it.
            if (pending.get(key)?.[1] === promise) pending.delete(key);
          }

          return { store, attemptedFallbacks };
        })();

        pending.set(key, [gen, promise]);
        return promise;
      };

      i18n.registerLoader(async (locale, namespace) => {
        const ck = `${locale}:${namespace}`;
        const active = i18n.getActiveNamespaces();
        const { store, attemptedFallbacks } = await fetchFromApi(
          locale,
          active.includes(namespace) ? active : [...active, namespace],
        );

        const cached = store.get(ck);
        if (cached) return cached;

        if (!attemptedFallbacks.has(ck)) {
          const fallbackResult = await tryFallback(
            fallback,
            locale,
            namespace,
            defaultNs,
            reportSuccess,
          );
          if (isStopped()) throw new RequestAbortedError("API translation fallback");
          if (fallbackResult.data) {
            return fallbackResult.data;
          }
        }

        const error = new Error(`${ERROR_PREFIX} No translations found for ${ck}`);
        reportError(locale, namespace, error);
        throw error;
      });

      if (shouldLoadImmediately) {
        const loc = i18n.locale;
        const active = i18n.getActiveNamespaces();
        const nss = active.length > 0 ? active : [defaultNs];
        try {
          const { store } = await fetchFromApi(loc, nss);
          const translations: Record<string, Record<string, TranslationValue>> = {};
          for (const ns of nss) {
            const data = store.get(`${loc}:${ns}`);
            if (data) translations[`${loc}:${ns}`] = data;
          }
          if (Object.keys(translations).length > 0) {
            i18n.addMessages(translations);
          }
        } catch {
          // Errors already reported via onLoadError
        }
      }

      return () => {
        requests.stop();
        pending.clear();
      };
    } else {
      const cdn = createCdnLoad(
        { cdnUrl, defaultNs, timeout, cdnLayout, fallback, cache },
        requests,
      );

      i18n.registerLoader(cdn.load);

      if (shouldLoadImmediately) {
        await loadInitialFromCdn(i18n, defaultNs, cdn.load);
      }

      return () => {
        requests.stop();
        cdn.clear();
      };
    }
  };
};
