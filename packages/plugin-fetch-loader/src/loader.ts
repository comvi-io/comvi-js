import type { I18nPlugin, I18nPluginFactory, TranslationValue } from "@comvi/core";
import type { TranslationStore } from "./types";
import type { FetchLoaderOptions } from "./options";
import { FETCH_LOADER_PLUGIN_KEY } from "./plugin-key";
import {
  RequestAbortedError,
  buildCacheOptions,
  fetchJsonWithTimeout,
  isAborted,
  toError,
} from "./http-core";
import { buildCdnUrl } from "./cdn-url";
import { tryFallback } from "./fallback";
import { fetchApiTranslations } from "./cache";

export { resolveFallback } from "./fallback";

/**
 * Loads translations from Comvi's backend API in development mode and from the
 * CDN in production mode.
 *
 * @example
 * ```typescript
 * import { createI18n } from '@comvi/core';
 * import { FetchLoader } from '@comvi/plugin-fetch-loader';
 *
 * const i18n = createI18n({
 *   locale: 'en',
 *   apiKey: 'your-api-key',
 * })
 * .use(FetchLoader({
 *   cdnUrl: 'https://cdn.comvi.io/your-distribution-id',
 *   fallback: {
 *     'en': () => import('./locales/en.json'),
 *   },
 *   onLoadError: (locale, ns, error) => console.error('Load failed:', error)
 * }));
 *
 * await i18n.init();
 * ```
 */
export const FetchLoader: I18nPluginFactory<FetchLoaderOptions> = (options): I18nPlugin => {
  if (!options?.cdnUrl) throw new Error("[FetchLoader] cdnUrl is required");

  const {
    cdnUrl,
    baseUrl,
    apiBaseUrl: legacyApiBaseUrl,
    fallback,
    onLoadError,
    onLoadSuccess,
    timeout = 10000,
    retry,
    loadOnInit = true,
    cdnLayout,
    cache,
  } = options;

  // Explicit `baseUrl` wins over the legacy `apiBaseUrl` spelling; when both
  // are absent, downstream URL builders fall back to the build-time env
  // override / Comvi platform preset (API_BASE_URL).
  const apiBaseUrl = baseUrl ?? legacyApiBaseUrl;

  const cacheOpts = buildCacheOptions(cache);

  return async (i18n) => {
    i18n.setPluginData(FETCH_LOADER_PLUGIN_KEY, options);

    const defaultNs = i18n.getDefaultNamespace();
    const apiKey = i18n.apiKey;
    // During i18n.init(), core loads initial namespaces after every plugin has
    // registered its hooks. Loading here would emit namespaceLoaded too early
    // for later plugins such as the in-context editor.
    const shouldLoadImmediately = loadOnInit && !i18n.isInitializing;

    // Every in-flight request, with the scope it is loading, so a clear can
    // release exactly the ones core has already stopped waiting for.
    const inflight = new Set<{
      controller: AbortController;
      locale: string;
      namespaces: string[];
    }>();
    let stopped = false;
    const trackRequest = (locale: string, namespaces: string[]) => {
      const controller = new AbortController();
      if (stopped) controller.abort();
      const request = { controller, locale, namespaces };
      inflight.add(request);
      return {
        signal: controller.signal,
        release: () => inflight.delete(request),
      };
    };
    const abortAll = () => {
      stopped = true;
      for (const { controller } of inflight) controller.abort();
      inflight.clear();
    };

    /**
     * `clearTranslations()` drops the matching pending loads inside core and
     * only then announces the clear, so by the time this runs their results
     * would be discarded anyway. Aborting releases the socket instead of
     * letting an answer nobody will read finish arriving — and because core is
     * no longer waiting on them, the abort surfaces no `loadError`.
     *
     * A request is only abandoned when the clear covers ALL of it. In API mode
     * one request carries every active namespace, while `clearTranslations`
     * cancels the ONE namespace it names: aborting that shared request would
     * fail the namespaces core is still waiting for. An omitted locale or
     * namespace means "every one", exactly as it does on `clearTranslations`.
     */
    const unfollow = i18n.on("translationsCleared", ({ locale, namespace }) => {
      for (const request of inflight) {
        if (
          (locale === undefined || request.locale === locale) &&
          (namespace === undefined || request.namespaces.every((ns) => ns === namespace))
        ) {
          request.controller.abort();
          inflight.delete(request);
        }
      }
    });
    const reportSuccess = (locale: string, namespace: string) => {
      if (!stopped) onLoadSuccess?.(locale, namespace);
    };
    const reportError = (locale: string, namespace: string, error: Error) => {
      if (!stopped) onLoadError?.(locale, namespace, error);
    };

    if (apiKey) {
      const pending = new Map<
        string,
        Promise<{ store: TranslationStore; attemptedFallbacks: Set<string> }>
      >();

      const fetchFromApi = async (
        locale: string,
        namespaces: string[],
      ): Promise<{ store: TranslationStore; attemptedFallbacks: Set<string> }> => {
        const requestedNamespaces = [...new Set(namespaces)];
        const key = `${locale}:${[...requestedNamespaces].sort().join(",")}`;
        const existing = pending.get(key);
        if (existing) return existing;

        const promise = (async () => {
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
            if (signal.aborted || stopped) throw new RequestAbortedError("API translations");
            for (const ns of requestedNamespaces) {
              if (store.has(`${locale}:${ns}`)) reportSuccess(locale, ns);
            }
          } catch (error) {
            if (signal.aborted || stopped || isAborted(error)) {
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
                if (signal.aborted || stopped) {
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
            pending.delete(key);
          }

          return { store, attemptedFallbacks };
        })();

        pending.set(key, promise);
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
          if (stopped) throw new RequestAbortedError("API translation fallback");
          if (fallbackResult.data) {
            return fallbackResult.data;
          }
        }

        const error = new Error(`[FetchLoader] No translations found for ${ck}`);
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
            i18n.addTranslations(translations);
          }
        } catch {
          // Errors already reported via onLoadError
        }
      }

      return () => {
        unfollow();
        abortAll();
        pending.clear();
      };
    } else {
      const loading = new Map<string, Promise<Record<string, TranslationValue>>>();

      const loaderFn = async (
        locale: string,
        namespace: string,
      ): Promise<Record<string, TranslationValue>> => {
        const ck = `${locale}:${namespace}`;
        const existing = loading.get(ck);
        if (existing) return existing;

        const promise = (async () => {
          const { signal, release } = trackRequest(locale, [namespace]);
          const url = buildCdnUrl(cdnUrl, locale, namespace, defaultNs, cdnLayout);
          try {
            const result = await fetchJsonWithTimeout<Record<string, TranslationValue>>(
              url,
              { headers: { Accept: "application/json" }, signal, ...cacheOpts },
              timeout,
            );
            if (!result.ok) throw new Error(`HTTP ${result.status}: ${result.statusText}`);

            const data = result.data;
            if (signal.aborted || stopped) throw new RequestAbortedError(url);
            reportSuccess(locale, namespace);
            return data;
          } catch (error) {
            if (signal.aborted || stopped || isAborted(error)) {
              throw new RequestAbortedError(url);
            }
            const err = toError(error);
            const fallbackResult = await tryFallback(
              fallback,
              locale,
              namespace,
              defaultNs,
              reportSuccess,
              reportError,
            );
            if (signal.aborted || stopped) throw new RequestAbortedError(url);
            if (fallbackResult.data) {
              return fallbackResult.data;
            }
            if (fallbackResult.attempted) {
              throw fallbackResult.error ?? err;
            }
            reportError(locale, namespace, err);
            throw err;
          } finally {
            release();
            loading.delete(ck);
          }
        })();

        loading.set(ck, promise);
        return promise;
      };

      i18n.registerLoader(loaderFn);

      if (shouldLoadImmediately) {
        const loc = i18n.locale;
        const active = i18n.getActiveNamespaces();
        const nss = active.length > 0 ? active : [defaultNs];
        try {
          await Promise.all(
            nss.map(async (ns) => {
              const data = await loaderFn(loc, ns);
              i18n.addTranslations({ [`${loc}:${ns}`]: data });
            }),
          );
        } catch {
          // Errors already reported via onLoadError
        }
      }

      return () => {
        unfollow();
        abortAll();
        loading.clear();
      };
    }
  };
};
