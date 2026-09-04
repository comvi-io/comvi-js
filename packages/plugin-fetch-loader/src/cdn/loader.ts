import type { I18nPlugin, I18nPluginFactory, TranslationValue } from "@comvi/core";
import type { CdnLoaderOptions } from "./options";
import { FETCH_LOADER_PLUGIN_KEY } from "../plugin-key";
import {
  RequestAbortedError,
  buildCacheOptions,
  fetchJsonWithTimeout,
  isAborted,
  toError,
} from "../http-core";
import { buildCdnUrl } from "../cdn-url";
import { tryFallback } from "../fallback";

/**
 * Loads translations from a CDN — and only from a CDN.
 *
 * This is the CDN branch of `FetchLoader` as its own plugin. `FetchLoader`
 * decides between the CDN and the API at RUNTIME (`if (i18n.apiKey)`), so an
 * app that only ever reads a public distribution still ships the whole API
 * request path: the project-info cache, the legacy export chain and the retry
 * policy. Here that path does not exist, which is the entire point of the
 * subpath.
 *
 * Everything the CDN branch does, it still does: one request per
 * `locale:namespace` with concurrent callers deduplicated, a timeout that
 * covers the response BODY, the `fallback` import map, and the abort when the
 * host clears a scope that is still loading.
 *
 * @example
 * ```typescript
 * import { createI18n } from '@comvi/core';
 * import { CdnLoader } from '@comvi/plugin-fetch-loader/cdn';
 *
 * const i18n = createI18n({ locale: 'en' })
 *   .with(loader())
 *   .with(plugins());
 *
 * i18n.use(CdnLoader({ cdnUrl: 'https://cdn.comvi.io/your-distribution-id' }));
 *
 * await i18n.init();
 * ```
 */
export const CdnLoader: I18nPluginFactory<CdnLoaderOptions> = (options): I18nPlugin => {
  if (!options?.cdnUrl) throw new Error("[FetchLoader] cdnUrl is required");

  const {
    cdnUrl,
    fallback,
    onLoadError,
    onLoadSuccess,
    timeout = 10000,
    loadOnInit = true,
    cdnLayout,
    cache,
  } = options;

  const cacheOpts = buildCacheOptions(cache);

  return async (i18n) => {
    i18n.setPluginData(FETCH_LOADER_PLUGIN_KEY, options);

    const defaultNs = i18n.getDefaultNamespace();
    // During i18n.init(), core loads initial namespaces after every plugin has
    // registered its hooks. Loading here would emit namespaceLoaded too early
    // for later plugins such as the in-context editor.
    const shouldLoadImmediately = loadOnInit && !i18n.isInitializing;

    // Every in-flight request, with the scope it is loading, so a clear can
    // release exactly the ones core has already stopped waiting for.
    const inflight = new Set<{
      controller: AbortController;
      locale: string;
      namespace: string;
    }>();
    let stopped = false;
    const trackRequest = (locale: string, namespace: string) => {
      const controller = new AbortController();
      if (stopped) controller.abort();
      const request = { controller, locale, namespace };
      inflight.add(request);
      return {
        signal: controller.signal,
        release: () => inflight.delete(request),
      };
    };

    /**
     * `clearTranslations()` drops the matching pending loads inside core and
     * only then announces the clear, so by the time this runs their results
     * would be discarded anyway. Aborting releases the socket instead of
     * letting an answer nobody will read finish arriving — and because core is
     * no longer waiting on them, the abort surfaces no `loadError`.
     *
     * An omitted locale or namespace means "every one", exactly as it does on
     * `clearTranslations`. One CDN request carries exactly one namespace, so a
     * clear that covers the request covers all of it.
     */
    const unfollow = i18n.on("translationsCleared", ({ locale, namespace }) => {
      for (const request of inflight) {
        if (
          (locale === undefined || request.locale === locale) &&
          (namespace === undefined || request.namespace === namespace)
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

    const loading = new Map<string, Promise<Record<string, TranslationValue>>>();

    const loaderFn = async (
      locale: string,
      namespace: string,
    ): Promise<Record<string, TranslationValue>> => {
      const ck = `${locale}:${namespace}`;
      const existing = loading.get(ck);
      if (existing) return existing;

      const promise = (async () => {
        const { signal, release } = trackRequest(locale, namespace);
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
      stopped = true;
      for (const { controller } of inflight) controller.abort();
      inflight.clear();
      loading.clear();
    };
  };
};
