/**
 * The Vue binding over the 0.8 core (design §3.5, §2.5, R3-5; mirrors `@comvi/react`).
 *
 * - `createI18n(options)` is core's instance plus `install`: `app.use(i18n)` provides it to
 *   every component of the app and sets the global `$t`. On a server, an instance per request
 *   (R3-18(3)): the app factory creates both.
 * - ONE subscription per instance: a `shallowRef` of its published state, made when the
 *   instance is. Readers take a SLICE through `computed`: `locale` and `dir` re-render only
 *   when they change, `t()` / `$t()` read the whole state (a new snapshot re-renders what
 *   called them — the accepted compromise of §2.5, as in React).
 * - A namespace is activated after the component mounts, never during setup or render
 *   (React: in an effect), and on a server before the component renders (`onServerPrefetch`:
 *   `renderToString` waits for it, so `handover()` carries it; lot 4b). React cannot wait in
 *   a server render: there the app loads the route's namespaces before it renders.
 * - `useI18n(ns).T` is a functional component (its namespace is that `useI18n`'s); the
 *   exported `<T>` (T.ts, its own chunk) activates the namespace of its `ns` attribute itself,
 *   and is in an app's bundle only when the app imports it (the R3-10 binding cap: +500 B).
 */
import {
  camelize,
  computed,
  customRef,
  inject,
  onMounted,
  onServerPrefetch,
  shallowRef,
  ssrContextKey,
  type FunctionalComponent,
  type App,
  type ComputedRef,
  type InjectionKey,
  type Ref,
  type ShallowRef,
  type VNodeArrayChildren,
  type VNodeChild,
} from "vue";
import {
  createI18n as create,
  type BoundTFor,
  type I18n,
  type I18nOptions,
  type NsOf,
  type TComponentFor,
  type TFor,
} from "@comvi/core";
import { activate, coming, N, state, translate, type State } from "@comvi/core/internal";

declare const __DEV__: boolean;

declare module "@comvi/core" {
  /**
   * What a tag handler of a generated catalog (`{ link: Tag }`) receives: the tag's
   * children as ONE child — their text when they are all text (the usual
   * `<link>terms</link>`), else the list of their parts. `h("a", props, children)` takes
   * both.
   */
  interface TagChildren {
    vue: Children;
  }
}

/** A tag's children, or a rich message: text, or the list of its parts (strings and nodes). */
export type Children = string | VNodeArrayChildren;

/** The instance `createI18n` of `@comvi/vue` makes: core's, plus `install` for `app.use()`. */
export type VueI18n = I18n & { install(app: App): void };

/**
 * Per instance: its published state, the `locale` and `dir` slices of it, and its bound
 * `<T>` per namespace (prototype-free, so a namespace called `constructor` gets its own).
 */
type Cell = readonly [
  ShallowRef<State>,
  Ref<string>,
  ComputedRef<"ltr" | "rtl">,
  Record<string, FunctionalComponent>,
];

/** The injection key, and the key of the cell on an instance this binding made. */
const K: InjectionKey<I18n> = Symbol();
/** Instances installed into an app on a server (development check, one per request). */
const served = new WeakSet<I18n>();
/** Instances made without `timeZone` (development check: a server render needs one). */
const zoneless = new WeakSet<I18n>();

/**
 * Rich parts → one child: their text when every part is a string, else the parts (Vue renders
 * an array child as a fragment). Also the core's joiner, so a tag handler gets its children
 * as this one child.
 */
const node = (r: unknown): any =>
  Array.isArray(r) && r.every((x) => typeof x == "string") ? r.join("") : r;

/** The cell of an instance this binding made. */
export const cell = (i: I18n): Cell => (i as unknown as Record<symbol, Cell>)[K];

/** `t()` of `i` for namespace `ns`, against the state its cell holds (a reactive read). */
const tr = (i: I18n, ns?: string) => (k: string, p?: object) =>
  node(translate(i, cell(i)[0].value, k, p as never, ns, node));

/**
 * Creates the instance (core's `createI18n`, same options) and makes it a Vue plugin:
 * `createApp(App).use(i18n)`.
 */
export const createI18n = (options: I18nOptions): VueI18n => {
  const i = create(options) as VueI18n;
  if (__DEV__ && !options.timeZone) zoneless.add(i);
  const s = shallowRef(state(i));
  i.on(() => (s.value = state(i)));
  (i as unknown as Record<symbol, Cell>)[K] = [
    s,
    // The `locale` slice: re-renders its readers on a locale change only. A failed switch
    // is reported through `onError` (load_failed, invalid_locale) and keeps the old
    // locale; its readers re-render then too, so a `v-model` control shows the locale on
    // screen again instead of the one it asked for. A `v-model` has nobody to hand the
    // rejection to: `setLocale()` is the call that rejects.
    ((l: ComputedRef<string>) =>
      customRef((track, trigger) => ({
        get: () => (track(), l.value),
        set: (v: string) => void i.setLocale(v).catch(trigger),
      })))(computed(() => s.value.locale)),
    computed(() => s.value.dir),
    N<FunctionalComponent>(),
  ];
  i.install = (app) => {
    // A server serves requests concurrently: one instance installed into two apps would
    // render one request in the locale another request switched to (R3-18(3)).
    if (__DEV__ && typeof document == "undefined") {
      if (served.has(i))
        throw Error(
          "[@comvi/vue] an instance is installed into a second app on the server: create the i18n instance per request, in the function that creates the app",
        );
      served.add(i);
    }
    app.provide(K, i);
    const t = tr(i);
    // `$t` renders without `use()`: it checks the zone of a server render itself.
    app.config.globalProperties.$t = (
      __DEV__ ? (k: string, p?: object) => (zone(i), t(k, p)) : t
    ) as never;
  };
  return i;
};

/**
 * Development: a server render (renderToString provides its context) of an instance with
 * no zone throws, checked as the first component renders, not at handover() — a server and
 * a browser in different zones format the same date differently (design §2.6). An app that
 * runs in Node without a server render (a test, a script) needs no zone. Called in setup
 * or render, where `inject` reads the app's context.
 */
const zone = (i: I18n) => {
  if (zoneless.has(i) && inject(ssrContextKey, null))
    throw TypeError(
      "[@comvi/vue] a server render needs the timeZone option: the server and the browser must format dates in one zone",
    );
};

/** The instance of the app this component belongs to. */
export const use = (): I18n => {
  const i = inject(K);
  if (__DEV__) {
    if (!i) throw Error("[@comvi/vue] no app.use(i18n) above this component");
    zone(i);
  }
  return i!;
};

/**
 * Params of a message in a project with no generated catalogs: a value, a node or a tag
 * handler. The handler member gives an inline `(children) => h("a", children)` its
 * argument type, so it needs no annotation.
 */
export type UntypedParams = Record<
  string,
  object | VNodeChild | ((children: Children) => VNodeChild)
>;

/** What a slot of `<T>` named after a tag receives. */
export interface TagSlotProps {
  /**
   * The tag's children: their text (`{{ children }}`), or the list of their parts when they
   * hold markup — give that tag a handler attribute instead (`:b="(c) => h('b', c)"`).
   */
  children: Children;
}

/**
 * `<T i18nKey ns? locale? markers? {...params}>`: typed by the generated catalogs when
 * declared. A tag's handler is a prop or a slot of the tag's name, so with generated
 * catalogs a `Tag` param is optional here.
 */
export type TComponent = [NsOf] extends [never]
  ? (
      props: { i18nKey: string; ns?: string; locale?: string; markers?: boolean } & UntypedParams,
    ) => VNodeChild
  : // The typo guard of `t()` (R3-2) is in the shared core type: see TComponentFor.
    TComponentFor<VNodeChild, 1>;

/** `<T>` bound to namespace NS (from `useI18n(ns)`): typed by that namespace's keys. */
export type BoundT<NS extends string = "default"> = [NsOf] extends [never]
  ? (
      props: { i18nKey: string; locale?: string; markers?: boolean; ns?: never } & UntypedParams,
    ) => VNodeChild
  : NS extends NsOf
    ? BoundTFor<NS, VNodeChild, 1>
    : never;

/** What `useI18n(ns)` returns. */
export interface UseI18n<NS extends string = "default"> {
  /**
   * `t()` against the instance's state; a template calling it re-renders on a new state. A
   * rich message renders the list of its parts (a render function's child; in a template use
   * `<T>`). Without generated catalogs it is typed `string`.
   */
  t: [NsOf] extends [never]
    ? (key: string, params?: UntypedParams) => string
    : TFor<NS, VNodeArrayChildren>;
  /** `<T>` bound to this namespace; the same component for every caller (R3-5(b)). */
  T: BoundT<NS>;
  /**
   * The locale on screen. Setting it switches (`setLocale`): the value stays the old one
   * until the new locale's catalogs are in, and stays the old one when the switch fails
   * (a `v-model` control shows it again). Re-renders only on a locale change.
   */
  locale: Ref<string>;
  dir: ComputedRef<"ltr" | "rtl">;
  /**
   * A catalog of this namespace is loading, for any locale (a switch in progress too), or
   * will load when the component activates the namespace after it mounts.
   */
  isLoading: ComputedRef<boolean>;
  setLocale: (locale: string) => Promise<void>;
  i18n: I18n;
}

/**
 * Renders message `i18nKey` of the attributes, the attributes as params and the slots as
 * tag handlers, in namespace `ns`. An attribute arrives as the template spells it
 * (`i18n-key`, `first-name`): camelized, as Vue camelizes props, so `:first-name` is
 * `{firstName}` — the name vue-tsc checks.
 */
export const render = (
  i: I18n,
  ns: unknown,
  attrs: Record<string, unknown>,
  slots: Record<string, any>,
) => {
  // Prototype-free: a slot named `constructor` is a handler, no inherited member.
  const q: Record<string, any> = N();
  for (const k in slots) q[k] = (children: unknown) => slots[k]({ children });
  // An attribute wins over a slot of the same name, even one bound to null or undefined:
  // the tag is then unhandled.
  for (const k in attrs) q[camelize(k)] = attrs[k];
  // `ns`, `locale` and `markers` are attributes too: the core reads them off the params as
  // per-call options. The caller's namespace is set last: a bound `<T>`'s wins over an
  // `ns` attribute (one an untyped project can pass).
  q.ns = ns;
  return tr(i)(q.i18nKey, q);
};

/**
 * The i18n of the app (`app.use(i18n)`). `ns` (default `default`) is the namespace of `t`
 * and `T`; it is activated on a server before the component renders, in a browser after it
 * mounts, never during setup. A failed load of it is not asked again by a remount —
 * `i18n.load(ns)` retries.
 */
export const useI18n = <NS extends string = "default">(ns?: NS): UseI18n<NS> => {
  const i = use();
  const [s, locale, dir, Ts] = cell(i);
  const n = ns || "default";
  const a = () => activate(i, n);
  onServerPrefetch(a);
  onMounted(a);
  return {
    t: tr(i, n) as UseI18n<NS>["t"],
    // Functional, one per instance and namespace (R3-5(b)): with no declared props every
    // attribute is a prop of it, so every one reaches the params and none falls through —
    // the exported `<T>`'s policy (`inheritAttrs: false`). Its namespace is activated by
    // this `useI18n(ns)`.
    T: (Ts[n] ||= (p, { slots }) => render(i, n, p, slots)) as unknown as BoundT<NS>,
    locale,
    dir,
    // Until the activation after mount, a namespace the loader will load is loading
    // already: no frame of its keys that says it is loaded (lot 1d).
    isLoading: computed(() => coming(i, s.value, n)),
    setLocale: i.setLocale,
    i18n: i,
  };
};
