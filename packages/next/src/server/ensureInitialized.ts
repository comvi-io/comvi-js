import type { ServerI18nHost } from "./hostTypes";

const initPromises = new WeakMap<ServerI18nHost, Promise<void>>();

/**
 * Ensure i18n instance is initialized, deduplicating concurrent calls.
 * @internal
 */
export const ensureInitialized = async (i18n: ServerI18nHost): Promise<void> => {
  if (i18n.isInitialized) {
    return;
  }

  let initPromise = initPromises.get(i18n);
  if (!initPromise) {
    initPromise = i18n
      .init()
      .then(() => undefined)
      .finally(() => {
        if (initPromises.get(i18n) === initPromise) {
          initPromises.delete(i18n);
        }
      });
    initPromises.set(i18n, initPromise);
  }

  await initPromise;
};
