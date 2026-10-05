/** The instance surface this bookkeeping needs: the cleared-scope announcement and the cache revision. */
export interface ClearedScopeHost {
  on(
    event: "messagesCleared",
    callback: (data: { locale?: string; namespace?: string }) => void,
  ): () => void;
  readonly messagesCache: { getRevision(): number };
}

/** The two report hooks every loader option bag carries. */
export interface LoadCallbacks {
  onLoadSuccess?: (locale: string, namespace: string) => void;
  onLoadError?: (locale: string, namespace: string, error: Error) => void;
}

interface InflightRequest {
  controller: AbortController;
  locale: string;
  namespaces: string[];
}

export interface InflightRequests {
  /**
   * Arms a controller for one request and registers the scope it is loading.
   * `release` unregisters it; a request started after `stop()` is born aborted.
   */
  track: (locale: string, namespaces: string[]) => { signal: AbortSignal; release: () => void };
  /**
   * The invalidation generation a request is joinable in. It moves whenever the
   * instance invalidates catalogs: every cache write or delete (`reloadMessages`,
   * `clearMessages`, `addMessages`) bumps the cache revision, and every
   * `messagesCleared` bumps it too, which covers a clear that found nothing
   * cached. A dedup entry from an older generation is never joined.
   *
   * Deliberately coarse: ANY catalog write moves it, so two calls for the same
   * scope made on different ticks may not share a request once an unrelated
   * catalog has landed between them. That costs a duplicate request, never a
   * wrong result, and core-driven loads stay de-duplicated by core's own
   * pending-load map regardless.
   */
  generation: () => number;
  /** True once `stop()` has run — the plugin is torn down, discard everything. */
  isStopped: () => boolean;
  /** Reports through `onLoadSuccess` unless the plugin is torn down. */
  reportSuccess: (locale: string, namespace: string) => void;
  /** Reports through `onLoadError` unless the plugin is torn down. */
  reportError: (locale: string, namespace: string, error: Error) => void;
  /** Stops following the instance, aborts every in-flight request, and stays stopped. */
  stop: () => void;
}

/**
 * The in-flight bookkeeping both request paths share: which scopes are loading,
 * whether the plugin is still alive, and the abort that follows the instance's
 * `messagesCleared`.
 *
 * `clearMessages()` drops the matching pending loads inside core and only
 * then announces the clear, so by the time the listener runs their results
 * would be discarded anyway. Aborting releases the socket instead of letting an
 * answer nobody will read finish arriving — and because core is no longer
 * waiting on them, the abort surfaces no `loadError`.
 *
 * A request is only abandoned when the clear covers ALL of it. In API mode one
 * request carries every active namespace, while `clearMessages` cancels the
 * ONE namespace it names: aborting that shared request would fail the
 * namespaces core is still waiting for. A CDN request carries exactly one
 * namespace, so the same rule abandons it whenever its namespace is named. An
 * omitted locale or namespace means "every one", exactly as it does on
 * `clearMessages`.
 */
export function trackInflight(i18n: ClearedScopeHost, callbacks: LoadCallbacks): InflightRequests {
  // Read once, at install time, exactly as the plugin factories destructure the
  // rest of their options: an options object mutated after install must not
  // change where reports go.
  const { onLoadSuccess, onLoadError } = callbacks;
  const inflight = new Set<InflightRequest>();
  let stopped = false;
  let cleared = 0;

  const unfollow = i18n.on("messagesCleared", ({ locale, namespace }) => {
    cleared++;
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

  return {
    track: (locale, namespaces) => {
      const controller = new AbortController();
      if (stopped) controller.abort();
      const request = { controller, locale, namespaces };
      inflight.add(request);
      return {
        signal: controller.signal,
        release: () => inflight.delete(request),
      };
    },
    // Both counters only grow, so their sum moves whenever either does.
    generation: () => cleared + i18n.messagesCache.getRevision(),
    isStopped: () => stopped,
    reportSuccess: (locale, namespace) => {
      if (!stopped) onLoadSuccess?.(locale, namespace);
    },
    reportError: (locale, namespace, error) => {
      if (!stopped) onLoadError?.(locale, namespace, error);
    },
    stop: () => {
      unfollow();
      stopped = true;
      for (const { controller } of inflight) controller.abort();
      inflight.clear();
    },
  };
}
