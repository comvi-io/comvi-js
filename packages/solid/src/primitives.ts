import { from, type Accessor } from "solid-js";
import type { I18n } from "@comvi/core";

// CSR-only: provider auto-init does not run during SSR. Producers call set() synchronously so the first read is always defined.

/**
 * Creates a SolidJS signal for the current locale
 * Updates automatically when locale changes
 * MUST be called within a reactive context (component or effect)
 */
export function createLocaleSignal(i18n: I18n): Accessor<string> {
  const signal = from<string>((set) => {
    set(i18n.locale);
    return i18n.on("localeChanged", ({ to }) => set(to));
  });
  return signal as Accessor<string>;
}

/**
 * Creates a SolidJS signal for the default namespace
 * Updates automatically when default namespace changes
 * MUST be called within a reactive context (component or effect)
 */
export function createDefaultNamespaceSignal(i18n: I18n): Accessor<string> {
  const signal = from<string>((set) => {
    set(i18n.getDefaultNamespace());
    return i18n.on("defaultNamespaceChanged", ({ to }) => set(to));
  });
  return signal as Accessor<string>;
}

/**
 * Creates a SolidJS signal for the loading state
 * Updates when translations are being loaded
 * MUST be called within a reactive context (component or effect)
 */
export function createLoadingSignal(i18n: I18n): Accessor<boolean> {
  const signal = from<boolean>((set) => {
    set(i18n.isLoading);
    return i18n.on("loadingStateChanged", ({ isLoading }) => set(isLoading));
  });
  return signal as Accessor<boolean>;
}

/**
 * Creates a SolidJS signal for the initializing state
 * Updates during initialization
 * MUST be called within a reactive context (component or effect)
 */
export function createInitializingSignal(i18n: I18n): Accessor<boolean> {
  const signal = from<boolean>((set) => {
    set(i18n.isInitializing);
    return i18n.on("loadingStateChanged", ({ isInitializing }) => set(isInitializing));
  });
  return signal as Accessor<boolean>;
}

/**
 * Creates a SolidJS signal for the initialized state
 * Updates during initialization
 * MUST be called within a reactive context (component or effect)
 */
export function createInitializedSignal(i18n: I18n): Accessor<boolean> {
  const signal = from<boolean>((set) => {
    const syncInitializedState = () => set(i18n.isInitialized);
    syncInitializedState();

    const unsubInitialized = i18n.on("initialized", syncInitializedState);
    const unsubDestroyed = i18n.on("destroyed", syncInitializedState);

    return () => {
      unsubInitialized();
      unsubDestroyed();
    };
  });
  return signal as Accessor<boolean>;
}

/**
 * Creates a SolidJS signal that tracks translation cache/config changes
 * Uses revision counter for efficient O(1) change detection
 * MUST be called within a reactive context (component or effect)
 */
export function createCacheRevisionSignal(i18n: I18n): Accessor<number> {
  const signal = from<number>((set) => {
    // Single monotonic counter — avoids the old cacheRev+configRev sum collision (dropped re-render).
    let revision = 0;
    const bump = () => set(++revision);

    set(revision);
    const unsub1 = i18n.on("namespaceLoaded", bump);
    const unsub2 = i18n.on("initialized", bump);
    const unsub3 = i18n.on("translationsCleared", bump);
    const unsub4 = i18n.on("configChanged", bump);
    const unsub5 = i18n.on("defaultNamespaceChanged", bump);

    return () => {
      unsub1();
      unsub2();
      unsub3();
      unsub4();
      unsub5();
    };
  });
  return signal as Accessor<number>;
}
