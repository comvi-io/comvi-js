import type { TranslationValue } from "@comvi/core";
import type { CdnLayoutOptions, FallbackMap, FetchLoaderOptions } from "./options";
import type { InflightRequests } from "./inflight";
import {
  ERROR_PREFIX,
  RequestAbortedError,
  assertCatalogObject,
  buildCacheOptions,
  fetchJsonWithTimeout,
  isAborted,
  toError,
} from "./http-core";
import { buildCdnUrl } from "./cdn-url";
import { tryFallback } from "./fallback";

/** What a CDN load needs to know, once, for the life of the plugin. */
export interface CdnLoadConfig {
  cdnUrl: string;
  defaultNs: string;
  timeout: number;
  cdnLayout?: CdnLayoutOptions;
  fallback?: FallbackMap;
  cache?: FetchLoaderOptions["cache"];
}

export interface CdnLoad {
  /** One `locale:namespace`; concurrent callers for the same key share a request. */
  load: (locale: string, namespace: string) => Promise<Record<string, TranslationValue>>;
  /** Drops the dedup map. The requests themselves are aborted by the tracker. */
  clear: () => void;
}

/**
 * THE CDN request path — the one both `fetchLoaderPlugin` (as its no-`apiKey` branch)
 * and `cdnLoaderPlugin` (as its whole job) run.
 *
 * One request per `locale:namespace`, under a timeout that covers the response
 * BODY, with the `fallback` import map behind it. Nothing here is retried: core's
 * fallback-locale loop already sits in front of it, and retrying would multiply
 * what `setLocale` costs on a flapping CDN.
 *
 * Cancellation is not this module's decision. It asks `requests` for a signal,
 * and every point where a result could still be published re-checks it: a load
 * whose scope the instance cleared, or whose plugin was torn down, rejects as
 * aborted and reports nothing — core stopped waiting for it before the clear
 * was even announced.
 */
export function createCdnLoad(config: CdnLoadConfig, requests: InflightRequests): CdnLoad {
  const { cdnUrl, defaultNs, timeout, cdnLayout, fallback } = config;
  // Destructured once: every member is read on each load, and a local binding
  // minifies where a cross-module property name cannot.
  const { track, generation, isStopped, reportSuccess, reportError } = requests;
  const cacheOpts = buildCacheOptions(config.cache);
  // Each entry remembers the invalidation generation it started in: a load
  // after a reload or clear must not join a request the host abandoned.
  const loading = new Map<string, [number, Promise<Record<string, TranslationValue>>]>();

  const load = async (
    locale: string,
    namespace: string,
  ): Promise<Record<string, TranslationValue>> => {
    const ck = `${locale}:${namespace}`;
    const gen = generation();
    const existing = loading.get(ck);
    if (existing?.[0] === gen) return existing[1];

    let promise!: Promise<Record<string, TranslationValue>>;
    // eslint-disable-next-line prefer-const -- the finally compares against it
    promise = (async () => {
      const { signal, release } = track(locale, [namespace]);
      const url = buildCdnUrl(cdnUrl, locale, namespace, defaultNs, cdnLayout);
      try {
        const result = await fetchJsonWithTimeout<Record<string, TranslationValue>>(
          url,
          { headers: { Accept: "application/json" }, signal, ...cacheOpts },
          timeout,
        );
        if (!result.ok)
          throw new Error(`${ERROR_PREFIX} HTTP ${result.status}: ${result.statusText}`);

        const data = result.data;
        // The API path validates every catalog position it stores; the CDN
        // path serves one catalog per request and validates that. Without it a
        // string root became per-character keys and an array or `null` an
        // empty catalog, where a reported load failure belongs.
        assertCatalogObject(data, "CDN", ck);
        if (signal.aborted || isStopped()) throw new RequestAbortedError(url);
        reportSuccess(locale, namespace);
        return data;
      } catch (error) {
        if (signal.aborted || isStopped() || isAborted(error)) {
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
        if (signal.aborted || isStopped()) throw new RequestAbortedError(url);
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
        // Only this request's own entry: a newer one may have replaced it.
        if (loading.get(ck)?.[1] === promise) loading.delete(ck);
      }
    })();

    loading.set(ck, [gen, promise]);
    return promise;
  };

  return { load, clear: () => loading.clear() };
}

/** The instance surface the install-time load needs. */
export interface InitialLoadHost {
  readonly locale: string;
  getActiveNamespaces(): string[];
  addMessages(translations: Record<string, Record<string, TranslationValue>>): void;
}

/**
 * The catalogs to fetch at install time: whatever the instance has already
 * activated, or the default namespace when it has activated nothing yet. Errors
 * are swallowed because `onLoadError` has already reported them — throwing here
 * would fail the plugin install over a CDN that is merely down.
 */
export async function loadInitialFromCdn(
  i18n: InitialLoadHost,
  defaultNs: string,
  load: CdnLoad["load"],
): Promise<void> {
  const locale = i18n.locale;
  const active = i18n.getActiveNamespaces();
  const namespaces = active.length > 0 ? active : [defaultNs];
  try {
    await Promise.all(
      namespaces.map(async (ns) => {
        const data = await load(locale, ns);
        i18n.addMessages({ [`${locale}:${ns}`]: data });
      }),
    );
  } catch {
    // Errors already reported via onLoadError
  }
}
