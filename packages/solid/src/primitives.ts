import { from, type Accessor } from "solid-js";
import { subscribeToRevision } from "@comvi/core";
import type {
  WrapperI18nHost,
  DefaultTranslationParams,
  DefaultParamsSnapshot,
  SetDefaultParamsArg,
} from "@comvi/core";

// CSR-only: provider auto-init does not run during SSR. Every producer below
// calls `set()` synchronously, so the first read is always defined.
//
// Two names, one rule: `create*Signal` READS — it returns an `Accessor` that
// mirrors the host, for all seven axes — and `create*State` READS AND WRITES,
// returning `[accessor, setter]` for the two axes a host lets you write
// (`defaultNamespace`, `defaultParams`). A setter always writes THROUGH to the
// host; nothing here holds a local value the host does not have.

/** MUST be called within a reactive context (component or effect). */
export function createLocaleSignal(i18n: WrapperI18nHost): Accessor<string> {
  const signal = from<string>((set) => {
    set(i18n.locale);
    return i18n.on("localeChanged", () => set(i18n.locale));
  });
  return signal as Accessor<string>;
}

/**
 * Read-only: the accessor mirrors the instance, and the writable form of the same
 * axis is {@link createDefaultNamespaceState}. MUST be called within a
 * reactive context (component or effect).
 */
export function createDefaultNamespaceSignal(i18n: WrapperI18nHost): Accessor<string> {
  const signal = from<string>((set) => {
    set(i18n.getDefaultNamespace());
    return i18n.on("defaultNamespaceChanged", ({ to }) => set(to));
  });
  return signal as Accessor<string>;
}

/**
 * The default namespace paired with a setter that writes straight through to
 * `i18n.setDefaultNamespace` — the writable form of the axis
 * {@link createDefaultNamespaceSignal} reads, and the counterpart of svelte's
 * writable `createDefaultNamespaceStore`. The accessor half only mirrors the
 * instance, so changing the namespace means calling the setter. MUST be called
 * within a reactive context (component or effect).
 */
export function createDefaultNamespaceState(
  i18n: WrapperI18nHost,
): [Accessor<string>, (namespace: string) => void] {
  const namespace = createDefaultNamespaceSignal(i18n);
  const setDefaultNamespace = (value: string) => i18n.setDefaultNamespace(value);
  return [namespace, setDefaultNamespace];
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
 * Read-only shallow snapshot of the instance-level interpolation defaults: the
 * accessor mirrors the instance, so mutating the defaults means writing to the
 * instance, not assigning into the returned snapshot. The writable form of the
 * same axis is {@link createDefaultParamsState}. MUST be called within a
 * reactive context (component or effect).
 */
export function createDefaultParamsSignal<D extends DefaultTranslationParams = {}>(
  i18n: WrapperI18nHost<D>,
): Accessor<DefaultParamsSnapshot<D>> {
  const signal = from<DefaultParamsSnapshot<D>>((set) => {
    // `as never`: `Setter<T>`'s overloads exclude `Function` from `T`, which
    // TS cannot prove for `DefaultParamsSnapshot<D>` — a conditional type over
    // an unresolved generic. The Accessor's declared type param above is what
    // callers actually see; this cast only silences the producer's own
    // internal call.
    set(i18n.defaultParams as never);
    return i18n.on("configChanged", () => set(i18n.defaultParams as never));
  });
  return signal as Accessor<DefaultParamsSnapshot<D>>;
}

/**
 * The instance-level interpolation defaults paired with a setter that writes
 * straight through to `i18n.setDefaultParams` — the writable form of the axis
 * {@link createDefaultParamsSignal} reads, and the counterpart of svelte's
 * writable `createDefaultParamsStore` (`.set` / `.update` there). The accessor
 * half only mirrors the instance, so changing the defaults means calling the
 * setter. MUST be called within a reactive context (component or effect).
 */
export function createDefaultParamsState<D extends DefaultTranslationParams = {}>(
  i18n: WrapperI18nHost<D>,
): [Accessor<DefaultParamsSnapshot<D>>, (params: SetDefaultParamsArg<D>) => void] {
  const params = createDefaultParamsSignal(i18n);
  const setDefaultParams = (next: SetDefaultParamsArg<D>) => i18n.setDefaultParams(next);
  return [params, setDefaultParams];
}

/**
 * Tracks messages cache/config changes as a monotonic revision counter.
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
