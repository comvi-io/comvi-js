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
 * - `loading` / `suspense` gate the FIRST paint of an instance only, and only while a
 *   namespace with a load in flight is not ready (the core's `isReady`: no catalog of the
 *   locale on screen, a parent or a fallback locale): once its subtree has rendered, a lazy
 *   namespace, a retry or a switch never unmounts it.
 * - `useI18n(ns)` holds `ns` from its commit to its cleanup (an effect: a render React
 *   abandons holds nothing, Strict Mode's second setup is counted right); `t()` and `<T>`
 *   read only (lot 4c).
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
  type ComponentType,
  type ReactElement,
  type ReactNode,
} from "react";
import type { BoundTFor, Catalog, I18n, NsOf, TComponentFor, TFor, UntypedT } from "@comvi/core";
import { core, N, type State } from "@comvi/core/internal";

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
   * Rendered instead of the children for the instance's first paint while a namespace is
   * loading with no catalog usable for the locale on screen — its own, a parent's or an
   * allowed fallback locale's (`isReady`); a catalog of another locale does not count.
   * Inline catalogs of the chain, a fallback locale's catalog or a server payload the
   * instance was created from open it.
   * After that the children stay mounted: a lazy namespace shows through
   * `useI18n(ns).isLoading`, a switch keeps the old locale until the new one lands.
   * The children do not render while it shows, so an `<I18nHandover>` among them waits too on
   * a client render (a hydration is never gated): give the instance its data first
   * (`createI18n({ ...options, ...payload })`).
   */
  loading?: ReactNode;
  /**
   * Suspend instead (throw `i18n.ready` to the nearest `<Suspense>`) where `loading` would
   * render. `ready` is one promise per set of loads, so a re-render while
   * they are in flight does not suspend again; after the first paint nothing suspends.
   */
  suspense?: boolean;
  children?: ReactNode;
}

/** What a provider gives its subtree: the instance and the state its render shows. */
export type Ctx = readonly [I18n, State];

// No provider: `0` (development checks it; production trusts the setup).
const C = createContext<Ctx>(0 as never);
const L = createContext("");

/**
 * Rich parts → one node: a Fragment with the parts as varargs (no keys, no cloneElement).
 * Also the core's joiner, so a tag handler gets its children as this one node.
 */
const node = (r: any): any => (r.map ? createElement(Fragment, null, ...(r as ReactNode[])) : r);

export const provide = (v: Ctx, children: ReactNode) =>
  createElement(
    C.Provider,
    { value: v },
    createElement(L.Provider, { value: v[1].locale }, children),
  );

/** The context of the nearest provider (`<I18nHandover>` reads it). */
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
  children,
  // No `loading`: the children render while the first catalogs load (keys of what is
  // still coming), as without a gate.
  loading: spinner = children,
  suspense,
}: I18nProviderProps): ReactElement => {
  const x = core(i);
  const get = () => x.s();
  // Not gated: painted already, or a server or hydration render — React reads the server
  // snapshot there, which marks `open` (with the state itself: any truthy value does).
  let open: unknown = painted.has(i);
  const s = useSyncExternalStore(i.on, get, () => (open = get()));
  const v = useMemo((): Ctx => [i, s], [i, s]);
  // The first paint waits while a load is in flight for a namespace that is not ready —
  // the core's `isReady`: no catalog of the locale on screen, a parent or a fallback locale
  // (one of another locale shows no text of this one) — but never on a server or in a
  // hydration: the hydration renders what the server rendered (the children), and an
  // `<I18nHandover>` anywhere among them brings its catalogs at commit.
  const busy = !open && s.ld.some((k) => !x.r(s, k.split("\0")[1]));
  // Painted when a render without the gate COMMITS: a render React abandons changes
  // nothing about the first paint.
  useEffect(() => void (busy || painted.add(i)));
  if (busy && suspense) throw i.ready;
  return provide(v, busy ? spinner : children);
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
      props: {
        i18nKey: string;
        locale?: string;
        markers?: boolean;
        ns?: never;
        components?: Readonly<Record<string, TagComponent>>;
      } & UntypedParams,
    ) => ReactNode
  : NS extends NsOf
    ? BoundTFor<NS, ReactNode, 2, Readonly<Record<string, TagComponent>>>
    : never;

/** What `useI18n(ns)` returns. */
export interface UseI18n<NS extends string = "default"> {
  /**
   * `t()` against what this render shows. A call whose params are all text (strings,
   * numbers, dates…) returns a `string`; a rich message (a tag handler, an element param)
   * returns a React element. Without generated catalogs a call with a handler or an element
   * param is typed `string | ReactElement`: the message decides at run time.
   */
  t: [NsOf] extends [never] ? UntypedT<ReactElement, UntypedParams> : TFor<NS, ReactElement>;
  /** `<T>` bound to this namespace; the same component on every render (R3-5(b)). */
  T: BoundT<NS>;
  locale: string;
  dir: "ltr" | "rtl";
  /**
   * A catalog of this namespace is usable for the locale on screen: its own, a parent's
   * (`pt` for `pt-BR`) or an allowed fallback locale's — inline, cached, handed over or
   * loaded; an empty one too. Keys are not promised: a key a catalog lacks is a plain missing
   * key. During a switch it is the locale still on screen that counts. Not the same as the
   * `i18n.ready` promise, which settles when the loads in flight settle, failed ones too.
   */
  isReady: boolean;
  /**
   * A catalog of this namespace is loading, for any locale (a switch in progress too, a
   * background load beside a usable catalog), or will load when this hook holds the
   * namespace at commit. `false` once a load failed with nothing in flight: no catalog and
   * not loading is the "unavailable" state, never an endless one.
   */
  isLoading: boolean;
  setLocale: (locale: string) => Promise<void>;
  i18n: I18n;
}

/**
 * Bound `<T>` per namespace: one component identity for the app's lifetime. Prototype-free,
 * so a namespace called `constructor` or `toString` gets its own component.
 */
const Ts = N<(props: object) => ReactNode>();

/**
 * The i18n of the nearest `<I18nProvider>`. `ns` is the namespace of `t` and `T`. The
 * component holds it from its commit to its unmount (or a change of `ns`): while held it
 * loads for the locale on screen and for every locale `setLocale()` switches to; with no
 * consumer left it stays cached but a switch does not load it. A failed load of it is not
 * asked again by a remount — `i18n.load(ns)` retries.
 */
export const useI18n = <NS extends string = "default">(ns?: NS): UseI18n<NS> => {
  const c = useContext(C);
  if (__DEV__ && !c) throw Error("[@comvi/react] no <I18nProvider> above this component");
  const [i, s] = c!;
  const x = core(i);
  const n = ns || "default";
  // Held at commit, released by the cleanup (unmount, a new `ns`): a render React abandons
  // holds nothing. `default` too: an app whose `namespaces` option leaves it out loads it on
  // first use (a hold never rejects; `i18n.load(ns)` is the call that reports).
  useEffect(() => x.h(n), [x, n]);
  return useMemo(
    () => ({
      locale: s.locale,
      dir: s.dir,
      // From this render's snapshot. Until the hold at commit, what the hold will load is
      // loading already: no frame that says "unavailable", no `missing_key` (lot 1d, 4c).
      isReady: x.r(s, n),
      isLoading: !!x.w(s, n),
      setLocale: i.setLocale,
      i18n: i,
      // `node` joins rich parts into one node and, through the core, gives every tag
      // handler (`defaultParams` ones too) its children as ONE node: `<a>{chunks}</a>`
      // renders nested tags and element params without React's missing-key warning.
      // A declared read (development's `d`): this hook holds `n` at commit.
      t: ((k: string, p?: Record<string, unknown>) =>
        node((__DEV__ ? x.d! : x.tr)(s, k, p, n, node))) as UseI18n<NS>["t"],
      T: (Ts[n] ||= (q) => read({ ...q, ns: n } as never, 1)) as BoundT<NS>,
    }),
    [c, n],
  );
};

/**
 * What renders a tag through `components` (R3-24): an HTML tag name (`"strong"`), a
 * component, or `{ component, props }` for one that needs props of its own
 * (`{ component: "a", props: { href: "/terms" } }`); the tag's content is its `children`.
 */
export type TagComponent =
  | string
  | ComponentType<{ children?: ReactNode }>
  | { component: string | ComponentType<any>; props?: Readonly<Record<string, unknown>> };

/** The locale this render shows. Re-renders on a locale change only, not on a namespace load. */
export const useLocale = (): string => useContext(L);

/**
 * `<T i18nKey ns? locale? markers? components? {...params}>`: typed by the generated
 * catalogs when declared. A tag param is required unless `components` is passed (it may
 * render the tag; which tags it covers is not checked).
 * `markers={false}` keeps an in-context editor session from marking this message (R3-14 H9).
 */
export type TComponent = [NsOf] extends [never]
  ? (
      props: {
        i18nKey: string;
        ns?: string;
        locale?: string;
        markers?: boolean;
        components?: Readonly<Record<string, TagComponent>>;
      } & UntypedParams,
    ) => ReactNode
  : // The typo guard of `t()` (R3-2) is in the shared core type: see TComponentFor.
    TComponentFor<ReactNode, 2, Readonly<Record<string, TagComponent>>>;

/** `<T>`'s render: reads the message, never loads (lot 4c); `u`: a bound `<T>`'s declared read. */
const read = (
  {
    components: m,
    ...p
  }: {
    i18nKey: string;
    ns?: string;
    components?: Record<string, TagComponent>;
  } & Record<string, unknown>,
  u?: 1,
) => {
  for (const k in m) {
    // A tag name, a component, or `{ component, props }` (R3-24); a component (a function,
    // a class, a memo/forwardRef/lazy object) has no `props` of its own to misread. An
    // entry that is `undefined` leaves the tag to be rendered as text.
    const e = m[k] as { component?: ComponentType; props?: object } & ComponentType;
    if (p[k] === undefined && e)
      p[k] = (c: ReactNode) => createElement(e.component || e, e.props, c);
  }
  const [i, s] = useCtx();
  const x = core(i);
  // The props are the params: `ns`, `locale` and `markers` are per-call options the core
  // reads off them, and `i18nKey` is a param no message uses.
  return node((__DEV__ && u ? x.d! : x.tr)(s, p.i18nKey, p as never, p.ns, node));
};

/**
 * Renders one message; params are props. A tag renders through, in this order: a prop of
 * the tag's name (`link={(c) => <a href="/terms">{c}</a>}`), then its entry in `components`
 * (`components={{ b: "strong", link: { component: "a", props: { href: "/terms" } } }}`) — a
 * prop or an entry that is `undefined` leaves the tag to the next; with neither, the tag's
 * content renders as text. Every prop but `i18nKey`, `components` and the per-call options
 * `ns`, `locale` and `markers` is a message param — `children` and `className` too, so a tag
 * named like a DOM prop is still a handler. `ns` is explicit: `<T>` never takes the namespace
 * of a `useI18n(ns)` above it (R3-5); `useI18n(ns).T` is the bound one. `<T>` reads only: it
 * loads nothing, `<T ns="account">` neither — `useI18n("account")` in the component (or
 * `i18n.load`, the `namespaces` option) loads it (lot 4c). `markers={false}` opts the message
 * out of an in-context editor session (R3-14 H9).
 */
export const T = ((p) => read(p)) as TComponent;
