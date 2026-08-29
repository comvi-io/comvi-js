import { from, type Accessor } from "solid-js";
import { subscribeToRevision } from "@comvi/core";
import type { WrapperI18nHost } from "@comvi/core";

// CSR-only: provider auto-init does not run during SSR. Every producer below
// calls `set()` synchronously, so the first read is always defined.

/** MUST be called within a reactive context (component or effect). */
export function createLocaleSignal(i18n: WrapperI18nHost): Accessor<string> {
  const signal = from<string>((set) => {
    set(i18n.locale);
    return i18n.on("localeChanged", ({ to }) => set(to));
  });
  return signal as Accessor<string>;
}

/** MUST be called within a reactive context (component or effect). */
export function createDefaultNamespaceSignal(i18n: WrapperI18nHost): Accessor<string> {
  const signal = from<string>((set) => {
    set(i18n.getDefaultNamespace());
    return i18n.on("defaultNamespaceChanged", ({ to }) => set(to));
  });
  return signal as Accessor<string>;
}

/** MUST be called within a reactive context (component or effect). */
export function createLoadingSignal(i18n: WrapperI18nHost): Accessor<boolean> {
  const signal = from<boolean>((set) => {
    set(i18n.isLoading);
    return i18n.on("loadingStateChanged", ({ isLoading }) => set(isLoading));
  });
  return signal as Accessor<boolean>;
}

/** MUST be called within a reactive context (component or effect). */
export function createInitializingSignal(i18n: WrapperI18nHost): Accessor<boolean> {
  const signal = from<boolean>((set) => {
    set(i18n.isInitializing);
    return i18n.on("loadingStateChanged", ({ isInitializing }) => set(isInitializing));
  });
  return signal as Accessor<boolean>;
}

/** MUST be called within a reactive context (component or effect). */
export function createInitializedSignal(i18n: WrapperI18nHost): Accessor<boolean> {
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
 * Tracks translation cache/config changes as a monotonic revision counter.
 * MUST be called within a reactive context (component or effect).
 */
export function createCacheRevisionSignal(i18n: WrapperI18nHost): Accessor<number> {
  const signal = from<number>((set) => {
    // ONE monotonic counter: summing a cache and a config revision let two
    // opposite steps collide and drop a re-render.
    //
    // Core's canonical revision event set MINUS the locale/loading axes, which
    // have their own primitives here — bumping on those would break the
    // pinned-locale contract that `<T locale="…">` does not recompute when the
    // global locale changes.
    let revision = 0;
    set(revision);
    return subscribeToRevision(i18n, (event) => {
      if (event !== "localeChanged" && event !== "loadingStateChanged") {
        set(++revision);
      }
    });
  });
  return signal as Accessor<number>;
}
