/**
 * The Solid binding over the 0.8 core (design §3.4, §2.5, R3-18; mirrors `@comvi/react`).
 *
 * - ONE signal per provider, fed by the instance's published state. Readers take a SLICE:
 *   `locale` and `dir` are memos that re-run on a change of their value only, `t()` reads the
 *   whole state (a new snapshot re-runs what called it: the accepted compromise of §2.5).
 * - `loading` gates the FIRST paint of an instance only, on the core's `isReady`, never on a
 *   server or in a hydration; after that the children stay mounted.
 * - `useI18n(ns)` holds `ns` from its mount to its cleanup; `t()` and `<T>` read only (lot 4c).
 *   On a server it holds at once, per request (no mount there), and the nearest `<Suspense>`
 *   waits through `createResource` for a load in flight (R3-18), so `renderToStringAsync` and a
 *   stream send text and `handover()` carries the catalog.
 * - `<T>` re-renders only on a state that can change its message: a render makes new nodes.
 * - No JSX in here: the source compiles to `createComponent` calls, so one build serves the
 *   browser and the server.
 */
import {
  createComponent,
  createContext,
  createMemo,
  createResource,
  createSignal,
  onCleanup,
  onMount,
  sharedConfig,
  Show,
  useContext,
  type Accessor,
  type Component,
  type JSX,
} from "solid-js";
import { Dynamic, isServer } from "solid-js/web";
import type { BoundTFor, I18n, NsOf, TComponentFor, TFor, UntypedT } from "@comvi/core";
import { core, loading, N, type State } from "@comvi/core/internal";

declare const __DEV__: boolean;

declare module "@comvi/core" {
  /** A tag handler of a generated catalog (`{ link: Tag }`) receives its children as JSX. */
  interface TagChildren {
    solid: JSX.Element;
  }
}

export interface I18nProviderProps {
  /** Read once: a provider serves one instance. On a server, one per request. */
  i18n: I18n;
  /**
   * Rendered instead of the children for the instance's first paint while a namespace is
   * loading with no catalog usable for the locale on screen (`isReady`). After that the children
   * stay mounted: a lazy namespace shows through `useI18n(ns).isReady` / `isLoading`, a switch
   * keeps the old locale until the new one lands. A lazy namespace that a child's `useI18n(ns)`
   * holds at its mount loads after that paint, so that component shows its own placeholder.
   */
  loading?: JSX.Element;
  children?: JSX.Element;
}

/** What a provider gives its subtree: the instance, its state, the locale and dir slices. */
export type Ctx = readonly [I18n, Accessor<State>, Accessor<string>, Accessor<"ltr" | "rtl">];

const C = createContext<Ctx>();

/** The context of the nearest provider. */
export const useCtx = (): Ctx => {
  const c = useContext(C);
  if (__DEV__ && !c) throw Error("[@comvi/solid] no <I18nProvider> above this component");
  return c!;
};

/** Instances whose subtree has painted: `loading` gates the first paint only. */
const painted = new WeakSet<I18n>();

/** Makes `i18n` the instance of its subtree, re-running what reads it on a published change. */
export const I18nProvider = (p: I18nProviderProps): JSX.Element => {
  const i = p.i18n;
  const x = core(i);
  let s: Accessor<State> = x.s;
  // A server renders once per pass, from the instance's state as it is then.
  let slice = <T>(f: () => T): Accessor<T> => f;
  if (!isServer) {
    const [state, set] = createSignal(x.s());
    onCleanup(i.on(() => set(x.s())));
    s = state;
    slice = createMemo;
  }
  // Never gated in a hydration: it renders what the server rendered, the children.
  const open = isServer || sharedConfig.context;
  const busy = slice(() => {
    const v = s();
    const b =
      !open &&
      !painted.has(i) &&
      p.loading !== undefined &&
      v.ld.some((k) => !x.r(v, k.split("\0")[1]!));
    if (!b) painted.add(i);
    return b;
  });
  return createComponent(C.Provider, {
    value: [i, s, slice(() => s().locale), slice(() => s().dir)],
    get children() {
      return createComponent(Show as (p: object) => JSX.Element, {
        get when() {
          return !busy();
        },
        get fallback() {
          return p.loading;
        },
        get children() {
          return p.children;
        },
      });
    },
  });
};

/**
 * What a plain `{x}` prints as text (`String(value)`), or a list of them. A plain `{x}` is
 * always text (owner decision 04.11.2026): markup comes only from tags.
 */
type Text = string | number | bigint | boolean | Date | null | undefined;

/**
 * Params of a message in a project with no generated catalogs: a value printed as text or a
 * tag handler. A JSX element is no param: `Hello, <strong>{name}</strong>!` with
 * `components={{ strong: "strong" }}` renders it. The handler member gives an inline
 * `(chunks) => <a>{chunks}</a>` its argument type, so it needs no annotation. The handler
 * receives the tag's content as JSX (a list of parts), so one annotated with a narrower type
 * (`(c: string) => …`) is refused: it would throw at run time.
 * `C` is `<T>`'s `components` map, a prop under the same index signature.
 */
export type UntypedParams<C = never> = Record<
  string,
  Text | readonly Text[] | ((chunks: JSX.Element) => unknown) | C
>;

/**
 * What renders a tag through `components` (R3-24): an HTML tag name (`"strong"`), a component,
 * or `{ component, props }` for one that needs props of its own
 * (`{ component: "a", props: { href: "/terms" } }`); the tag's content is its `children`.
 */
export type TagComponent =
  | string
  | Component<any>
  | { component: string | Component<any>; props?: Readonly<Record<string, unknown>> };

/**
 * `<T i18nKey ns? locale? markers? components? {...params}>`: typed by the generated catalogs
 * when declared. A tag param is required unless `components` is passed.
 */
export type TComponent = [NsOf] extends [never]
  ? (
      props: {
        i18nKey: string;
        ns?: string;
        locale?: string;
        markers?: boolean;
        components?: Readonly<Record<string, TagComponent>>;
      } & UntypedParams<Readonly<Record<string, TagComponent>>>,
    ) => JSX.Element
  : TComponentFor<JSX.Element, 2, Readonly<Record<string, TagComponent>>>;

/** `<T>` bound to namespace NS (from `useI18n(ns)`): typed by that namespace's keys. */
export type BoundT<NS extends string = "default"> = [NsOf] extends [never]
  ? (
      props: {
        i18nKey: string;
        locale?: string;
        markers?: boolean;
        ns?: never;
        components?: Readonly<Record<string, TagComponent>>;
      } & UntypedParams<Readonly<Record<string, TagComponent>>>,
    ) => JSX.Element
  : NS extends NsOf
    ? BoundTFor<NS, JSX.Element, 2, Readonly<Record<string, TagComponent>>>
    : never;

/** What `useI18n(ns)` returns. */
export interface UseI18n<NS extends string = "default"> {
  /**
   * `t()` against the state; a JSX expression, memo or effect calling it re-runs on a new state.
   * A call whose params are all text returns a `string`; a rich message returns its parts (a
   * JSX child), or a string when its handlers returned text or the key is missing.
   */
  t: [NsOf] extends [never] ? UntypedT<JSX.Element, UntypedParams> : TFor<NS, JSX.Element>;
  /** `<T>` bound to this namespace; the same component for every caller (R3-5(b)). */
  T: BoundT<NS>;
  /** The locale on screen. Re-runs its readers on a locale change only. */
  locale: Accessor<string>;
  dir: Accessor<"ltr" | "rtl">;
  /**
   * `useI18n(ns)`: a catalog of `ns` is usable for the locale on screen: its own, a parent's (`pt`
   * for `pt-BR`) or an allowed fallback locale's — inline, cached, handed over or loaded; an
   * empty one too. During a switch it is the locale still on screen that counts; after a failed
   * load it is true when a fallback locale's catalog is in.
   * `useI18n()` (or `undefined`): true when this holds for `default` (the namespace its `t`
   * reads) AND every namespace of the `namespaces` option — not for `default` alone, so
   * `useI18n()` and `useI18n("default")` differ when the option names others. A usable catalog,
   * not every key. Check it before `isLoading`: a load beside usable catalogs (a switch) must
   * not hide the text; `false` with `isLoading` false means the text is unavailable and nothing
   * is loading (a failed load, or no loader), not necessarily an error.
   */
  isReady: Accessor<boolean>;
  /**
   * `useI18n(ns)`: a catalog of `ns` is loading, for any locale, or will load when this component
   * holds it at mount. `false` once a load failed with nothing in flight: with no usable
   * catalog that is the "unavailable" state (`isReady` false too), never an endless one.
   * `useI18n()` (or `undefined`): true when this holds for `default` or SOME namespace of the
   * `namespaces` option; a namespace outside them changes nothing.
   */
  isLoading: Accessor<boolean>;
  setLocale: (locale: string) => Promise<void>;
  i18n: I18n;
}

/**
 * `<T>`'s body: reads the message, never loads (lot 4c). A memo, so a handler's nodes have one
 * owner and go with the next render. `n`: the namespace of a bound `<T>`, which wins over an
 * `ns` prop.
 */
export const read = (p: Record<string, any>, n?: string): JSX.Element => {
  const [i, s] = useCtx();
  const x = core(i);
  let ns: string;
  // Solid has no reconciler: a render makes new nodes, so a state that cannot change this message
  // (a hold, another namespace's load) must not re-render it, or a link or a nested component
  // would be replaced under the user. What the message reads: the locale, its namespace's
  // catalogs, the editor's hook, and whether its namespace is loading (a
  // failed load makes a missing key report).
  const v = createMemo(() => ((ns = n || p.ns || "default"), s()), undefined, {
    equals: (a, b) =>
      !!a &&
      a.locale == b.locale &&
      a.c[ns] == b.c[ns] &&
      a.mk == b.mk &&
      loading(a, ns) == loading(b, ns),
  });
  return createMemo(() => {
    // Prototype-free: a tag called `constructor` has no inherited handler. Copying reads every
    // prop, so a change of any one re-renders. The props are the params: `ns`, `locale` and
    // `markers` are per-call options the core reads off them.
    const q: Record<string, any> = N(p);
    const m = q.components;
    for (const k in m) {
      // A tag name, a component, or `{ component, props }` (R3-24); an entry that is `undefined`
      // leaves the tag to be rendered as text. An empty tag passes no children.
      const e = m[k];
      if (q[k] === undefined && e)
        q[k] = (c: unknown[]) =>
          createComponent(Dynamic, {
            ...e.props,
            component: e.component || e,
            ...(c.length && { children: c }),
          });
    }
    if (n) q.ns = n;
    return x.tr(v(), q.i18nKey, q, q.ns) as JSX.Element;
  }) as unknown as JSX.Element;
};

/** Bound `<T>` per namespace; prototype-free, so a namespace called `constructor` gets its own. */
const Ts = N<(p: object) => JSX.Element>();

/**
 * The i18n of the nearest `<I18nProvider>`. `ns` (default `default`) is the namespace of `t` and
 * `T`, and of `isReady` / `isLoading` when given: with no `ns` those read `default` and every
 * namespace of the `namespaces` option (a server render waits for them too), so `useI18n()` is
 * not `useI18n("default")` there. The component holds it from its mount to its cleanup: while
 * held it loads for the locale on screen and for every locale `setLocale()` switches to; with no
 * consumer left it stays cached but a switch does not load it. A failed load of it is not asked
 * again by a remount — `i18n.load(ns)` retries.
 * On a server it is held for the request, and the nearest `<Suspense>` waits for its load.
 */
export const useI18n = <NS extends string = "default">(ns?: NS): UseI18n<NS> => {
  const [i, s, locale, dir] = useCtx();
  const x = core(i);
  const n = ns || "default";
  // Development: until the mount, reads of `n` are not idle ones.
  if (__DEV__) x.p!(n);
  // Once released, `isLoading` is a load in flight only: no hold of this one will load `n`, so a
  // result kept after the cleanup is not loading forever.
  let u = 0;
  // The flags' namespaces: `ns`, or with no argument `default` (what its `t` reads) and the
  // `namespaces` option's (duplicates change nothing in `every` / `some`).
  const a = [n, ...((ns === undefined && x.o.namespaces) || [])];
  const isLoading = () => a.some((m) => x.w(s(), m, u));
  if (isServer) {
    x.h(n);
    // The render waits while what its flags cover loads (`a` holds `n`): else a no-argument
    // `useI18n()` renders the loading branch the browser, handed the catalog, does not.
    if (isLoading()) {
      // Under an id of its own, the namespace's: no hydration key of this component moves, the
      // browser (which has nothing to wait for) sees the same counts, and a second pass of the
      // boundary finds this resource.
      const c = sharedConfig.context!;
      sharedConfig.context = { ...c, id: `${c.id}${n}-`, count: 0 };
      const [wait] = createResource(() => i.ready, { deferStream: true });
      sharedConfig.context = c;
      // Read here: `isReady` branches and an exported `<T ns>` wait too.
      wait();
    }
  } else
    onMount(() => {
      const r = x.h(n);
      onCleanup(() => ((u = 1), r()));
    });
  return {
    t: ((k: string, p?: Record<string, unknown>) => x.tr(s(), k, p, n)) as UseI18n<NS>["t"],
    T: (Ts[n] ||= (q) => read(q, n)) as BoundT<NS>,
    locale,
    dir,
    // Until the hold at mount, what the hold will load is loading already: no frame that says
    // "unavailable", no `missing_key` (lot 1d, 4c).
    isReady: () => a.every((m) => x.r(s(), m)),
    isLoading,
    setLocale: i.setLocale,
    i18n: i,
  };
};
