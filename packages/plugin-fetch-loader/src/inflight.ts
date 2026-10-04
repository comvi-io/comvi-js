/** The host surface this bookkeeping needs: the cleared-scope announcement. */
export interface ClearedScopeHost {
  on(
    event: "messagesCleared",
    callback: (data: { locale?: string; namespace?: string }) => void,
  ): () => void;
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
  /** True once `stop()` has run — the plugin is torn down, discard everything. */
  isStopped: () => boolean;
  /** Reports through `onLoadSuccess` unless the plugin is torn down. */
  reportSuccess: (locale: string, namespace: string) => void;
  /** Reports through `onLoadError` unless the plugin is torn down. */
  reportError: (locale: string, namespace: string, error: Error) => void;
  /** Stops following the host, aborts every in-flight request, and stays stopped. */
  stop: () => void;
}

/**
 * The in-flight bookkeeping both request paths share: which scopes are loading,
 * whether the plugin is still alive, and the abort that follows the host's
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

  const unfollow = i18n.on("messagesCleared", ({ locale, namespace }) => {
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
