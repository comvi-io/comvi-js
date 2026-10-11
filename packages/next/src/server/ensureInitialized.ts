import { getRequestFailedLoads } from "./cache";
import type { ServerI18nInstance } from "./instanceTypes";

const initPromises = new WeakMap<ServerI18nInstance, Promise<void>>();

/**
 * Ensure i18n instance is initialized, deduplicating concurrent calls.
 * @internal
 */
export const ensureInitialized = async (i18n: ServerI18nInstance): Promise<void> => {
  if (i18n.isInitialized) {
    return;
  }

  let initPromise = initPromises.get(i18n);
  if (!initPromise) {
    // Core's `init()` loads the instance's own locale and its fallback chain. A
    // catalog that fails there has had its one attempt for this request, so it
    // goes into the same memo `loadChain` keeps: the chain load that follows
    // must not request and report it a second time.
    const stop = i18n.onLoadError((locale, namespace) => {
      getRequestFailedLoads().add(`${locale}:${namespace}`);
    });
    initPromise = i18n
      .init()
      .then(() => undefined)
      .finally(() => {
        stop();
        if (initPromises.get(i18n) === initPromise) {
          initPromises.delete(i18n);
        }
      });
    initPromises.set(i18n, initPromise);
  }

  await initPromise;
};
