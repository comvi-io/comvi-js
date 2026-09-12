import {
  createContext,
  useContext,
  createEffect,
  createMemo,
  Show,
  type JSX,
  type ParentComponent,
  type Accessor,
} from "solid-js";
import type { AnyI18nHost, WrapperI18nHost } from "@comvi/core";
import {
  createLocaleSignal,
  createDefaultNamespaceSignal,
  createLoadingSignal,
  createInitializingSignal,
  createInitializedSignal,
  createCacheRevisionSignal,
} from "./primitives";

/**
 * Loader/plugin-host capabilities are acquired separately through
 * `useI18nLoader()` / `useI18nPlugins()`, so the Provider accepts a host that
 * never had them.
 */
export interface I18nContextValue {
  i18n: WrapperI18nHost;
  /** Bound to the Provider's lifecycle, not the consumer's. */
  signals: {
    locale: Accessor<string>;
    defaultNamespace: Accessor<string>;
    isLoading: Accessor<boolean>;
    isInitializing: Accessor<boolean>;
    isInitialized: Accessor<boolean>;
    cacheRevision: Accessor<number>;
  };
}

// `AnyI18nHost` is core's: the `strictFunctionTypes` invariance in `D` it
// widens is documented there, once, for all three providers that accept it.
export type { AnyI18nHost };

const I18nContext = createContext<I18nContextValue>();

export interface I18nProviderProps {
  /** Any host, whatever default-params type it carries. */
  i18n: AnyI18nHost;
  /** Auto-initialize the instance on mount (default: true). */
  autoInit?: boolean;
  /**
   * Rendered INSTEAD of `children` until the host is INITIALIZED, so no paint
   * is ever a flash of raw keys. Omit it and `children` render throughout,
   * exactly as before this prop existed.
   *
   * The axis is the provider's own `isInitialized` signal — the one
   * `useI18n().isInitialized()` returns — not `isInitializing`: auto-init
   * starts from an effect, after the tree is built, so a gate on "is it
   * initializing" is open for exactly the paint the raw keys would appear in.
   * With `autoInit: false` the fallback therefore stays until your app calls
   * `i18n.init()` itself, and during `renderToString` — where no effect runs
   * and nothing initializes the host — the fallback is what the server paints.
   *
   * @example
   * ```tsx
   * <I18nProvider i18n={i18n} fallback={<p>Loading…</p>}>
   *   <App />
   * </I18nProvider>
   * ```
   */
  fallback?: JSX.Element;
  /**
   * Render locale for SSR, under the name `@comvi/vue` uses: the host adopts
   * it during the render phase, BEFORE the locale signal is seeded, so
   * `renderToString` and the hydrating client agree on the first paint. Set it
   * when the server renders in a locale the client would not detect on its
   * own.
   *
   * **The host must be per request.** This is a WRITE to `i18n.locale`, and
   * during `renderToString` it happens in the server process: a host built at
   * module scope and shared by every concurrent request would take one
   * request's locale into another's tree — the same leak
   * `@comvi/next`'s provider refuses to risk by never writing the locale on
   * the server. Build the host inside the request handler (see the SSR section
   * of the package README); on the client, where a module-scope host is the
   * normal shape, there is one request and nothing to leak.
   */
  ssrLocale?: string;
  /**
   * Called if auto-initialization fails. Core's configured error handler has
   * already reported the error by then; this only lets the app observe it too.
   */
  onError?: (error: Error) => void;
  children: JSX.Element;
}

export const I18nProvider: ParentComponent<I18nProviderProps> = (props) => {
  // Read once, in the component body — the RENDER phase, `renderToString`
  // included, not an effect: `ssrLocale` is the render locale, the same
  // contract vue's option of that name has, and the host is the ONE place that
  // locale can live — `t()` resolves against `i18n.locale`, so seeding only
  // the signal would leave the text and the locale disagreeing. Before
  // `signalsMemo` below, so the first paint already reads it. The write is why
  // an SSR app must hand this provider a PER-REQUEST host; see the prop's doc.
  const ssrLocale = props.ssrLocale;
  if (ssrLocale !== undefined && props.i18n.locale !== ssrLocale) {
    props.i18n.locale = ssrLocale;
  }

  // `isInitialized`/`isInitializing` are plain non-reactive getters, read here
  // only as a re-entry guard: the effect re-runs on `props.i18n` /
  // `props.autoInit` alone, by design.
  createEffect(() => {
    if (props.autoInit !== false && !props.i18n.isInitialized && !props.i18n.isInitializing) {
      props.i18n.init().catch((err: unknown) => {
        // Already reported through core's error handler; this is the extra hop
        // to the optional prop.
        props.onError?.(err instanceof Error ? err : new Error(String(err)));
      });
    }
  });

  // The `from()` signals MUST be created directly in this memo's reactive
  // scope. Wrapping them in `untrack(...)` or a detached `createRoot(...)`
  // detaches their cleanups from the memo's owner and leaks the core event
  // subscriptions whenever `props.i18n` is swapped.
  const signalsMemo = createMemo(() => ({
    locale: createLocaleSignal(props.i18n),
    defaultNamespace: createDefaultNamespaceSignal(props.i18n),
    isLoading: createLoadingSignal(props.i18n),
    isInitializing: createInitializingSignal(props.i18n),
    isInitialized: createInitializedSignal(props.i18n),
    cacheRevision: createCacheRevisionSignal(props.i18n),
  }));

  // Getters, so the context object's identity stays stable while still
  // pointing at the current instance's signals.
  const signals = {
    get locale() {
      return signalsMemo().locale;
    },
    get isLoading() {
      return signalsMemo().isLoading;
    },
    get defaultNamespace() {
      return signalsMemo().defaultNamespace;
    },
    get isInitializing() {
      return signalsMemo().isInitializing;
    },
    get isInitialized() {
      return signalsMemo().isInitialized;
    },
    get cacheRevision() {
      return signalsMemo().cacheRevision;
    },
  };

  // `undefined` means "no gate", the same axis `@comvi/react` reads
  // (`fallback !== undefined`): a wrapper that forwards its own optional prop
  // passes `fallback={undefined}`, and that must render the children
  // throughout rather than gate on a blank node. `fallback={null}` still IS a
  // blank gate.
  //
  // Read ONCE and lazily, never in the component body. Solid props are
  // getters, so `<I18nProvider fallback={<Spinner />}>` re-runs `Spinner` on
  // every access — and the read has to happen INSIDE the context below, since
  // a fallback may call `useI18n()`. `||` short-circuits, so a host that is
  // already initialized never constructs the fallback at all.
  let fallbackNode: JSX.Element | undefined;
  let fallbackRead = false;
  const fallbackOnce = (): JSX.Element | undefined => {
    if (!fallbackRead) {
      fallbackRead = true;
      fallbackNode = props.fallback;
    }
    return fallbackNode;
  };

  return (
    <I18nContext.Provider
      value={{
        get i18n() {
          return props.i18n;
        },
        signals,
      }}
    >
      <Show
        when={signals.isInitialized() || fallbackOnce() === undefined}
        fallback={fallbackOnce()}
      >
        {props.children}
      </Show>
    </I18nContext.Provider>
  );
};

export function useI18nContextValue(): I18nContextValue {
  const ctx = useContext(I18nContext);
  if (!ctx) {
    throw new Error(
      "[@comvi/solid] i18n context not found. " + "Wrap your app with <I18nProvider i18n={i18n}>.",
    );
  }
  return ctx;
}

/**
 * The host the nearest `<I18nProvider>` holds, as a bare `WrapperI18nHost` —
 * THE name for "give me the host", the same in react, solid and svelte (vue's
 * equivalent is `inject(I18N_INJECTION_KEY).core`).
 *
 * @throws if called outside an `<I18nProvider>`.
 */
export function useI18nHost(): WrapperI18nHost {
  return useI18nContextValue().i18n;
}

/**
 * @deprecated Use `useI18nHost()` — the same host under the one name react,
 *   solid and svelte share. Scheduled for removal in the next major.
 */
export function useI18nContext(): WrapperI18nHost {
  return useI18nHost();
}
