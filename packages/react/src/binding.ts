/**
 * The React binding over the 0.8 core (design §3.4, §2.5; synthesis R4-15, R4-16, R4-20;
 * lot-0 spike S9, the commit model).
 *
 * - ONE subscription per provider: `useSyncExternalStore` on the instance's published
 *   state. Hooks read a SLICE of what the provider renders: `useI18n()` the whole state
 *   (a new snapshot re-renders it — the accepted compromise of §2.5), `useLocale()` only
 *   the locale (a namespace load re-renders nothing that reads it). The context value is
 *   memoized on (instance, state): a provider re-rendered by its parent re-renders no
 *   consumer.
 * - `loading` / `suspense` gate the FIRST paint of an instance only: once its subtree has
 *   rendered, a lazy namespace, a retry or a switch never unmounts it.
 * - `<I18nHandover>` (handover.ts) renders its subtree from a render-local `view()` and
 *   publishes at commit (S9).
 * - Fixed hook order in every component; nothing publishes during render (R4-17).
 */
import {
  createContext,
  createElement,
  Fragment,
  useContext,
  useEffect,
  useMemo,
  useSyncExternalStore,
  type ReactElement,
  type ReactNode,
} from "react";
import type { Catalog, I18n, KeysOf, NsOf, ParamsFor, TFor } from "@comvi/core";
import { activate, coming, state, translate, type State } from "@comvi/core/internal";

declare const __DEV__: boolean;

declare module "@comvi/core" {
  /**
   * A tag handler of a generated catalog (`{ link: Tag }`) receives ONE React node: the
   * binding joins the children into a Fragment (R4-20). Registered here, so an inline
   * `(chunks) => <a>{chunks}</a>` needs no annotation (lot 3; review 1c, LOW).
   */
  interface TagChildren {
    react: ReactNode;
  }
}

/** Catalogs by namespace, then locale (the shape of `createI18n({ catalogs })`). */
export type ProviderCatalogs = Readonly<Record<string, Readonly<Record<string, Catalog>>>>;

export interface I18nProviderProps {
  i18n: I18n;
  /**
   * Rendered instead of the children until the instance's first catalogs are in (its
   * first paint). After that the children stay mounted: a lazy namespace shows through
   * `useI18n(ns).isLoading`, a switch keeps the old locale until the new one lands.
   */
  loading?: ReactNode;
  /**
   * Suspend instead (throw `i18n.ready` to the nearest `<Suspense>`) until the instance's
   * first catalogs are in. `ready` is one promise per set of loads, so a re-render while
   * they are in flight does not suspend again; after the first paint nothing suspends.
   */
  suspense?: boolean;
  children?: ReactNode;
}

/** What a provider gives its subtree: the instance and the state its render shows. */
export type Ctx = readonly [I18n, State];

const C = createContext<Ctx | null>(null);
const L = createContext("");

/**
 * Rich parts → one node: a Fragment with the parts as varargs (no keys, no cloneElement).
 * Also the core's joiner, so a tag handler gets its children as this one node.
 */
const node = (r: unknown): any =>
  Array.isArray(r) ? createElement(Fragment, null, ...(r as ReactNode[])) : r;

export const provide = (v: Ctx, children: ReactNode) =>
  createElement(
    C.Provider,
    { value: v },
    createElement(L.Provider, { value: v[1].locale }, children),
  );

export const useCtx = (): Ctx => {
  const c = useContext(C);
  if (__DEV__ && !c) throw Error("[@comvi/react] no <I18nProvider> above this component");
  return c!;
};

/** Instances whose subtree has painted: `loading` / `suspense` gate the first paint only. */
const painted = new WeakSet<I18n>();

/** Makes `i18n` the instance of its subtree and re-renders it on every published change. */
export const I18nProvider = ({
  i18n: i,
  loading: spinner,
  suspense,
  children,
}: I18nProviderProps): ReactElement => {
  const get = () => state(i);
  const s = useSyncExternalStore(i.on, get, get);
  const v = useMemo((): Ctx => [i, s], [i, s]);
  // The first paint waits for every load in flight (the locale's chain, its fallbacks).
  // Marking an instance painted during render is idempotent and only ever moves one way:
  // a render React abandons leaves a fact about the instance true, nothing published.
  const busy = s.ld[0] && !painted.has(i);
  if (!busy) painted.add(i);
  if (busy && suspense) throw i.ready;
  return provide(v, busy && spinner !== undefined ? spinner : children);
};

/**
 * Params of a message in a project with no generated catalogs: a value, a node or a tag
 * handler. The handler member gives an inline `(chunks) => <a>{chunks}</a>` its argument
 * type, so it needs no annotation.
 */
export type UntypedParams = Record<string, object | ReactNode | ((chunks: ReactNode) => ReactNode)>;

/** `<T>` bound to namespace NS (from `useI18n(ns)`): typed by that namespace's keys. */
export type BoundT<NS extends string = "default"> = [NsOf] extends [never]
  ? (
      props: { i18nKey: string; locale?: string; markers?: boolean; ns?: never } & UntypedParams,
    ) => ReactNode
  : NS extends NsOf
    ? <K extends KeysOf[NS]>(
        props: { i18nKey: K; locale?: string; markers?: boolean; ns?: never } & ParamProps<NS, K>,
      ) => ReactNode
    : never;

/** What `useI18n(ns)` returns. */
export interface UseI18n<NS extends string = "default"> {
  /**
   * `t()` against what this render shows; a rich message renders a React element. Without
   * generated catalogs it is typed `string` (render rich text with `<T>`).
   */
  t: [NsOf] extends [never]
    ? (key: string, params?: UntypedParams) => string
    : TFor<NS, ReactElement>;
  /** `<T>` bound to this namespace; the same component on every render (R3-5(b)). */
  T: BoundT<NS>;
  locale: string;
  dir: "ltr" | "rtl";
  /**
   * A catalog of this namespace is loading, for any locale (a switch in progress too), or
   * will load when this hook activates the namespace after commit.
   */
  isLoading: boolean;
  setLocale: (locale: string) => Promise<void>;
  i18n: I18n;
}

/**
 * Bound `<T>` per namespace: one component identity for the app's lifetime. Prototype-free,
 * so a namespace called `constructor` or `toString` gets its own component.
 */
const Ts: Record<string, (props: object) => ReactNode> = Object.create(null);

/**
 * The i18n of the nearest `<I18nProvider>`. `ns` is the namespace of `t` and `T`; it is
 * activated (loaded for the locale) after commit, never during render. A failed load of it
 * is not asked again by a remount — `i18n.load(ns)` retries.
 */
export const useI18n = <NS extends string = "default">(ns?: NS): UseI18n<NS> => {
  const c = useCtx();
  const [i, s] = c;
  useEffect(() => {
    if (ns) activate(i, ns);
  }, [i, ns]);
  return useMemo(
    () => ({
      // `node` joins rich parts into one node and, through the core, gives every tag
      // handler (`defaultParams` ones too) its children as ONE node: `<a>{chunks}</a>`
      // renders nested tags and element params without React's missing-key warning.
      t: ((k: string, p?: Record<string, unknown>) =>
        node(translate(i, s, k, p, ns, node))) as UseI18n<NS>["t"],
      T: (ns ? (Ts[ns] ||= (q) => T({ ...q, ns } as never)) : T) as BoundT<NS>,
      locale: s.locale,
      dir: s.dir,
      // Until the activation after commit, a namespace the loader will load is loading
      // already: no frame of its keys that says it is loaded, no `missing_key` (lot 1d).
      isLoading: coming(i, s, ns || "default"),
      setLocale: i.setLocale,
      i18n: i,
    }),
    [c, ns],
  );
};

/** The locale this render shows. Re-renders on a locale change only, not on a namespace load. */
export const useLocale = (): string => useContext(L);

type ParamProps<N extends NsOf, K extends KeysOf[N]> = [ParamsFor<N, K>] extends [never]
  ? {}
  : ParamsFor<N, K>;

/**
 * `<T i18nKey ns? locale? markers? {...params}>`: typed by the generated catalogs when
 * declared. `markers={false}` keeps an in-context editor session from marking this
 * message (R3-14 H9).
 */
export type TComponent = [NsOf] extends [never]
  ? (
      props: { i18nKey: string; ns?: string; locale?: string; markers?: boolean } & UntypedParams,
    ) => ReactNode
  : <K extends KeysOf[N], N extends NsOf = "default" & NsOf>(
      props: { i18nKey: K; ns?: N; locale?: string; markers?: boolean } & ParamProps<N, K>,
    ) => ReactNode;

/**
 * Renders one message; params are props, a tag handler is a prop of the tag's name
 * (`<T i18nKey="terms" link={(c) => <a href="/terms">{c}</a>} />`). Every prop but
 * `i18nKey` and the per-call options `ns`, `locale` and `markers` is a message param —
 * `children` and `className` too, so a tag named like a DOM prop is still a handler. `ns`
 * is explicit: `<T>` never takes the namespace of a `useI18n(ns)` above it (R3-5);
 * `useI18n(ns).T` is the bound one. `markers={false}` opts the message out of an
 * in-context editor session (R3-14 H9).
 */
export const T = ((p: { i18nKey: string; ns?: string }) =>
  // The props are the params: `ns`, `locale` and `markers` are per-call options the core
  // reads off them, and `i18nKey` is a param no message uses.
  (useI18n(p.ns).t as (k: string, p: object) => ReactNode)(p.i18nKey, p)) as TComponent;
